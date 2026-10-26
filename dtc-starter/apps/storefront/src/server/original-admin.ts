import { randomUUID } from "node:crypto"
import type { Document } from "mongodb"
import { authenticate, login, revokeSessions } from "./auth"
import { database, transaction } from "./mongodb"
import { ApiError, body, errorResponse, json, text } from "./http"
import { uploads } from "./uploads"
import {
  adminShippingOptions,
  hydrateAdminOrders,
  mutateAdminFulfillment,
} from "./admin-fulfillment"
import { rateLimit } from "./rate-limit"
import { provinceName } from "../lib/vietnam-provinces"
import { GET, POST, DELETE } from "../app/api/backend/[...path]/route"

const cookieName = "_yarnly_admin_jwt"
const uid = (prefix: string) => `${prefix}_${randomUUID()}`
const strip = (row: Document) => {
  const { _id, migration_snapshot, password_hash, ...data } = row
  return data
}
const mappings: Record<
  string,
  { collection: string; key: string; table?: string; fields: string[] }
> = {
  collections: {
    collection: "collections",
    key: "collections",
    table: "product_collection",
    fields: ["title", "handle", "metadata"],
  },
  "product-categories": {
    collection: "product_categories",
    key: "product_categories",
    table: "product_category",
    fields: [
      "name",
      "handle",
      "description",
      "is_active",
      "is_internal",
      "parent_category_id",
      "rank",
      "metadata",
    ],
  },
  "product-types": {
    collection: "admin_product_types",
    key: "product_types",
    table: "product_type",
    fields: ["value", "metadata"],
  },
  "product-tags": {
    collection: "admin_product_tags",
    key: "product_tags",
    table: "product_tag",
    fields: ["value", "metadata"],
  },
  "sales-channels": {
    collection: "admin_sales_channels",
    key: "sales_channels",
    table: "sales_channel",
    fields: ["name", "description", "is_disabled", "metadata"],
  },
  "stock-locations": {
    collection: "admin_stock_locations",
    key: "stock_locations",
    table: "stock_location",
    fields: ["name", "address", "metadata"],
  },
  "shipping-profiles": {
    collection: "admin_shipping_profiles",
    key: "shipping_profiles",
    table: "shipping_profile",
    fields: ["name", "type", "metadata"],
  },
  regions: {
    collection: "regions",
    key: "regions",
    fields: [
      "name",
      "currency_code",
      "countries",
      "automatic_taxes",
      "metadata",
    ],
  },
  "shipping-options": {
    collection: "shipping_options",
    key: "shipping_options",
    fields: ["name", "price_type", "amount", "data", "rules", "metadata"],
  },
  "customer-groups": {
    collection: "admin_customer_groups",
    key: "customer_groups",
    table: "customer_group",
    fields: ["name", "metadata"],
  },
  promotions: {
    collection: "promotions",
    key: "promotions",
    table: "promotion",
    fields: ["code", "is_automatic", "type", "status", "metadata"],
  },
  campaigns: {
    collection: "admin_campaigns",
    key: "campaigns",
    table: "campaign",
    fields: [
      "name",
      "description",
      "campaign_identifier",
      "starts_at",
      "ends_at",
      "budget",
      "metadata",
    ],
  },
  "price-lists": {
    collection: "admin_price_lists",
    key: "price_lists",
    table: "price_list",
    fields: [
      "title",
      "description",
      "type",
      "status",
      "starts_at",
      "ends_at",
      "metadata",
    ],
  },
  "tax-regions": {
    collection: "admin_tax_regions",
    key: "tax_regions",
    table: "tax_region",
    fields: ["country_code", "province_code", "parent_id", "metadata"],
  },
  "tax-rates": {
    collection: "admin_tax_rates",
    key: "tax_rates",
    table: "tax_rate",
    fields: [
      "name",
      "code",
      "rate",
      "is_default",
      "is_combinable",
      "tax_region_id",
      "metadata",
    ],
  },
  "payment-providers": {
    collection: "admin_payment_providers",
    key: "payment_providers",
    table: "payment_provider",
    fields: [],
  },
  "fulfillment-providers": {
    collection: "admin_fulfillment_providers",
    key: "fulfillment_providers",
    table: "fulfillment_provider",
    fields: [],
  },
  "shipping-option-types": {
    collection: "admin_shipping_option_types",
    key: "shipping_option_types",
    table: "shipping_option_type",
    fields: ["label", "description", "code"],
  },
  "product-options": {
    collection: "admin_product_options",
    key: "product_options",
    table: "product_option",
    fields: ["title", "metadata"],
  },
}
function paging(url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 20),
    offset = Number(url.searchParams.get("offset") ?? 0)
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new ApiError(400, "Invalid pagination")
  return { limit, offset }
}
function listFilter(url: URL, fields: string[] = ["name", "title", "email"]) {
  const result: Document = { deleted_at: null }
  for (const key of [
    "id",
    "status",
    "collection_id",
    "currency_code",
    "customer_id",
    "region_id",
    "payment_status",
    "fulfillment_status",
  ]) {
    const values = [...url.searchParams]
      .filter(
        ([name]) => name === key || new RegExp(`^${key}\\[\\d*\\]$`).test(name)
      )
      .map(([, value]) => value)
      .filter(Boolean)
    if (values.length) result[key] = { $in: values }
  }
  for (const key of ["is_giftcard", "discountable", "has_account"]) {
    const value = url.searchParams.get(key)
    if (value === "true" || value === "false") result[key] = value === "true"
  }
  for (const field of ["created_at", "updated_at"]) {
    for (const operator of ["gte", "lte", "gt", "lt"]) {
      const value = url.searchParams.get(`${field}[${operator}]`)
      if (value) {
        const date = new Date(value)
        if (!Number.isFinite(+date))
          throw new ApiError(400, "Invalid date filter")
        result[field] = { ...result[field], [`$${operator}`]: date }
      }
    }
  }
  const q = url.searchParams.get("q")?.trim().slice(0, 200)
  if (q)
    result.$or = fields.map((field) => ({
      [field]: {
        $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      },
    }))
  return result
}
async function archived(table: string) {
  const db = await database()
  return (
    await db
      .collection("migration_archive")
      .find({ table, "data.deleted_at": null }, { projection: { data: 1 } })
      .limit(1000)
      .toArray()
  ).map((row) => row.data as Document)
}
async function entityRows(mapping: (typeof mappings)[string]) {
  const db = await database(),
    current = await db.collection(mapping.collection).find({}).toArray()
  const old = mapping.table ? await archived(mapping.table) : []
  return [
    ...current,
    ...old.filter((row) => !current.some((existing) => existing.id === row.id)),
  ]
    .filter((row) => !row.deleted_at)
    .map(strip)
}
function adminRequest(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ??
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1)
  const headers = new Headers(request.headers)
  if (token) headers.set("authorization", `Bearer ${token}`)
  return new Request(request, { headers })
}
function cookieResponse(response: Response, token: string, remove = false) {
  response.headers.append(
    "set-cookie",
    `${cookieName}=${
      remove ? "" : token
    }; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remove ? 0 : 604800}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  )
  return response
}
export async function originalAdminAuth(request: Request, path: string[]) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin)
      throw new ApiError(403, "Invalid origin")
    if (path.join("/") === "user/emailpass" && request.method === "POST") {
      const input = await body(request)
      await rateLimit(
        `original-admin-login:${String(input.email).toLowerCase()}`
      )
      const network =
        request.headers.get("x-vercel-forwarded-for") ??
        request.headers.get("x-forwarded-for") ??
        "local"
      await rateLimit(
        `original-admin-network:${network.split(",")[0].trim()}`,
        50
      )
      const result = await login(input.email, input.password, "admin")
      return cookieResponse(json(result), result.token)
    }
    const authed = adminRequest(request),
      actor = await authenticate(authed, "admin")
    if (path.join("/") === "session") {
      if (request.method === "DELETE") {
        await revokeSessions(actor)
        return cookieResponse(json({ success: true }), "", true)
      }
      if (request.method === "POST")
        return cookieResponse(
          json({ user: { id: actor.id, email: actor.email } }),
          authed.headers.get("authorization")!.slice(7)
        )
    }
    throw new ApiError(501, "This authentication feature has not been migrated")
  } catch (error) {
    return errorResponse(error)
  }
}

async function hydrateProducts(rows: Document[]) {
  const db = await database()
  const inventory = await db
    .collection("inventory")
    .find({
      variant_id: {
        $in: rows.flatMap((p) => (p.variants ?? []).map((v: Document) => v.id)),
      },
    })
    .toArray()
  const collections = await db
    .collection("collections")
    .find({ id: { $in: rows.map((p) => p.collection_id).filter(Boolean) } })
    .toArray()
  const [types, channels, channelLinks] = await Promise.all([
    entityRows(mappings["product-types"]),
    entityRows(mappings["sales-channels"]),
    db
      .collection("migration_archive")
      .find(
        {
          table: "product_sales_channel",
          "data.product_id": { $in: rows.map((product) => product.id) },
          "data.deleted_at": null,
        },
        { projection: { data: 1 } }
      )
      .toArray(),
  ])
  const [stockLocations, levels] = await Promise.all([
    entityRows(mappings["stock-locations"]),
    db
      .collection("migration_archive")
      .find(
        {
          table: "inventory_level",
          "data.deleted_at": null,
          "data.inventory_item_id": {
            $in: inventory.map((row) => row.inventory_item_id).filter(Boolean),
          },
        },
        { projection: { data: 1 } }
      )
      .toArray(),
  ])
  return rows.map((product) => ({
    ...strip(product),
    tags: product.tags ?? [],
    categories: product.categories ?? [],
    images: product.images ?? [],
    options: product.options ?? [],
    sales_channels:
      product.sales_channels ??
      channels.filter((channel) =>
        channelLinks.some(
          (link) =>
            link.data.product_id === product.id &&
            link.data.sales_channel_id === channel.id
        )
      ),
    type: product.type_id
      ? types.find((type) => type.id === product.type_id) ?? null
      : null,
    is_giftcard: product.is_giftcard ?? false,
    discountable: product.discountable ?? true,
    collection: collections.find((c) => c.id === product.collection_id) ?? null,
    variants: (product.variants ?? []).map((v: Document) => {
      const stock = inventory.find((i) => i.variant_id === v.id)
      const stockLevels = levels.filter(
        (level) => level.data.inventory_item_id === stock?.inventory_item_id
      )
      const locationIds = [
        ...new Set(stockLevels.map((level) => level.data.location_id)),
      ]
      const locationId =
        stock?.location_id ??
        (locationIds.length === 1
          ? locationIds[0]
          : !locationIds.length && stockLocations.length === 1
          ? stockLocations[0].id
          : null)
      const inventoryItem = stock
        ? {
            id: stock.id ?? stock.variant_id,
            title: v.title,
            sku: v.sku ?? null,
            location_levels: locationId
              ? [
                  {
                    id:
                      stockLevels.find(
                        (level) => level.data.location_id === locationId
                      )?.data.id ??
                      stock.id ??
                      stock.variant_id,
                    location_id: locationId,
                    stocked_quantity: Number(stock.stock),
                    reserved_quantity: Number(stock.reserved),
                    available_quantity:
                      Number(stock.stock) - Number(stock.reserved),
                  },
                ]
              : [],
          }
        : null
      return {
        ...v,
        options: v.options ?? [],
        prices: v.prices ?? [],
        inventory_quantity:
          Number(stock?.stock ?? 0) - Number(stock?.reserved ?? 0),
        inventory: inventoryItem ? [inventoryItem] : [],
        inventory_items: inventoryItem
          ? [
              {
                inventory_item_id: inventoryItem.id,
                required_quantity: 1,
                inventory: inventoryItem,
              },
            ]
          : [],
      }
    }),
  }))
}
function safeMoney(value: unknown) {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new ApiError(400, "Invalid VND price")
  return amount
}

async function productApi(
  request: Request,
  path: string[],
  input: Document,
  url: URL
) {
  const db = await database(),
    id = path[1],
    method = request.method
  if (method === "GET") {
    const filter = {
      ...listFilter(url, ["title", "handle"]),
      ...(id ? { id } : {}),
    }
    const { limit, offset } = paging(url)
    const rows = await db
      .collection("products")
      .find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray()
    const products = await hydrateProducts(rows)
    if (path[2] === "variants") {
      const variants = products[0]?.variants ?? []
      return path[3]
        ? { variant: variants.find((v: Document) => v.id === path[3]) }
        : { variants, count: variants.length, limit, offset }
    }
    if (id) {
      if (!products[0]) throw new ApiError(404, "Product not found")
      return { product: products[0] }
    }
    return {
      products,
      count: await db.collection("products").countDocuments(filter),
      limit,
      offset,
    }
  }
  if (method === "DELETE" && id && path.length === 2) {
    const result = await db
      .collection("products")
      .updateOne(
        { id, deleted_at: null },
        { $set: { deleted_at: new Date(), status: "draft" } }
      )
    if (!result.matchedCount) throw new ApiError(404, "Product not found")
    return { id, object: "product", deleted: true }
  }
  if (
    method === "DELETE" &&
    id &&
    path[3] &&
    ["variants", "options"].includes(path[2])
  ) {
    await transaction(async (db, session) => {
      const product = await db
        .collection("products")
        .findOne({ id, deleted_at: null }, { session })
      if (!product) throw new ApiError(404, "Product not found")
      if (path[2] === "variants") {
        if (
          !product.variants.some((variant: Document) => variant.id === path[3])
        )
          throw new ApiError(404, "Variant not found")
        const stock = await db
          .collection("inventory")
          .findOne({ variant_id: path[3] }, { session })
        if (Number(stock?.reserved ?? 0) > 0)
          throw new ApiError(
            409,
            "This variant has stock reserved for existing orders"
          )
        await db.collection("products").updateOne(
          { id },
          {
            $set: {
              variants: product.variants.filter(
                (variant: Document) => variant.id !== path[3]
              ),
              updated_at: new Date(),
            },
          },
          { session }
        )
        await db
          .collection("inventory")
          .updateOne(
            { variant_id: path[3] },
            { $set: { deleted_at: new Date() } },
            { session }
          )
      } else {
        const option = product.options.find(
          (option: Document) => option.id === path[3]
        )
        if (!option) throw new ApiError(404, "Option not found")
        if (
          product.variants.some((variant: Document) =>
            variant.options?.some(
              (value: Document) =>
                value.option_id === path[3] || value.option?.id === path[3]
            )
          )
        )
          throw new ApiError(
            409,
            "Remove variants using this option before deleting it"
          )
        await db.collection("products").updateOne(
          { id },
          {
            $set: {
              options: product.options.filter(
                (option: Document) => option.id !== path[3]
              ),
              updated_at: new Date(),
            },
          },
          { session }
        )
      }
    })
    return {
      id: path[3],
      object: path[2] === "variants" ? "product_variant" : "product_option",
      deleted: true,
      parent: (
        await hydrateProducts([
          (await db.collection("products").findOne({ id }))!,
        ])
      )[0],
    }
  }
  if (method !== "POST") throw new ApiError(405, "Method not allowed")
  for (const key of [
    "variants",
    "options",
    "images",
    "prices",
    "categories",
    "tags",
    "sales_channels",
  ]) {
    if (
      input[key] !== undefined &&
      (key === "options" && path[2] === "variants"
        ? !input[key] ||
          typeof input[key] !== "object" ||
          Array.isArray(input[key])
        : !Array.isArray(input[key]) || input[key].length > 200)
    )
      throw new ApiError(400, `Invalid ${key}`)
  }
  if (
    input.status !== undefined &&
    !["draft", "proposed", "published", "rejected"].includes(input.status)
  )
    throw new ApiError(400, "Invalid product status")
  const savedId = await transaction(async (db, session) => {
    const current = id
      ? await db
          .collection("products")
          .findOne({ id, deleted_at: null }, { session })
      : null
    if (id && !current) throw new ApiError(404, "Product not found")
    const house = current?.artisan_id
      ? null
      : await db
          .collection("artisans")
          .findOne({ handle: "yarnly", status: "active" }, { session })
    if (!current && !house)
      throw new ApiError(409, "A Yarnly shop must be assigned to this product")
    const product: Document = current
      ? { ...current }
      : {
          id: uid("prod"),
          artisan_id: house!.id,
          title: text(input.title, "title"),
          handle: `${uid("product")}`,
          status: "draft",
          options: [],
          variants: [],
          images: [],
          categories: [],
          tags: [],
          metadata: { fulfillment_type: "ready" },
          deleted_at: null,
          created_at: new Date(),
        }
    if (path[2] === "variants") {
      const variantId = path[3] ?? uid("variant"),
        existing = product.variants.find((v: Document) => v.id === variantId)
      if (path[3] && !existing) throw new ApiError(404, "Variant not found")
      const variant = {
        ...(existing ?? {}),
        id: variantId,
        product_id: product.id,
      }
      for (const key of [
        "title",
        "sku",
        "barcode",
        "ean",
        "upc",
        "hs_code",
        "mid_code",
        "origin_country",
        "material",
        "weight",
        "length",
        "height",
        "width",
        "manage_inventory",
        "allow_backorder",
        "metadata",
      ])
        if (input[key] !== undefined) variant[key] = input[key]
      if (input.prices)
        variant.prices = input.prices.map((price: Document) => ({
          ...price,
          id: price.id ?? uid("price"),
          amount: safeMoney(price.amount),
        }))
      if (input.options)
        variant.options = product.options.flatMap((option: Document) =>
          (option.values ?? [])
            .filter((v: Document) => v.value === input.options[option.title])
            .map((value: Document) => ({ ...value, option }))
        )
      product.variants = existing
        ? product.variants.map((v: Document) =>
            v.id === variantId ? variant : v
          )
        : [...product.variants, variant]
      await db.collection("inventory").updateOne(
        { variant_id: variantId },
        {
          $setOnInsert: {
            id: variantId,
            variant_id: variantId,
            stock: 0,
            reserved: 0,
          },
        },
        { upsert: true, session }
      )
    } else if (path[2] === "options") {
      const optionId = path[3] ?? uid("opt")
      const existingOption = product.options.find(
        (option: Document) => option.id === optionId
      )
      const option = {
        id: optionId,
        product_id: product.id,
        title: text(input.title, "title"),
        values: (input.values ?? []).map((value: string) => ({
          id:
            existingOption?.values?.find(
              (existing: Document) => existing.value === value
            )?.id ?? uid("optval"),
          value,
          option_id: optionId,
        })),
      }
      const removedValues = new Set(
        (existingOption?.values ?? [])
          .filter(
            (value: Document) =>
              !option.values.some((next: Document) => next.id === value.id)
          )
          .map((value: Document) => value.id)
      )
      if (
        product.variants.some((variant: Document) =>
          variant.options?.some((value: Document) =>
            removedValues.has(value.id)
          )
        )
      )
        throw new ApiError(
          409,
          "Remove variants using these values before removing option values"
        )
      product.variants = product.variants.map((variant: Document) => ({
        ...variant,
        options: (variant.options ?? []).map((value: Document) =>
          value.option_id === optionId || value.option?.id === optionId
            ? { ...value, option }
            : value
        ),
      }))
      product.options = [
        ...product.options.filter((o: Document) => o.id !== optionId),
        option,
      ]
    } else {
      for (const key of [
        "title",
        "subtitle",
        "description",
        "handle",
        "status",
        "thumbnail",
        "weight",
        "length",
        "height",
        "width",
        "origin_country",
        "material",
        "hs_code",
        "mid_code",
        "collection_id",
        "type_id",
        "discountable",
        "metadata",
        "shipping_profile_id",
        "external_id",
      ])
        if (input[key] !== undefined) product[key] = input[key]
      if (input.images) {
        product.images = input.images.map((image: Document) => ({
          id: image.id ?? uid("img"),
          url: text(image.url, "image URL", 2000),
        }))
        if (!product.thumbnail)
          product.thumbnail = product.images[0]?.url ?? null
      }
      for (const [field, collection] of [
        ["categories", "product_categories"],
        ["tags", "admin_product_tags"],
        ["sales_channels", "admin_sales_channels"],
      ])
        if (input[field]) {
          const mapping = Object.values(mappings).find(
            (mapping) => mapping.collection === collection
          )
          const available = mapping
            ? await entityRows(mapping)
            : await db.collection(collection).find({}, { session }).toArray()
          const requested = input[field].map((row: Document) => row.id)
          const selected = available.filter((row) => requested.includes(row.id))
          if (selected.length !== new Set(requested).size)
            throw new ApiError(400, `Invalid ${field} association`)
          product[field] = selected.map(strip)
        }
      if (!current) {
        product.options = (input.options ?? []).map((o: Document) => {
          const optionId = uid("opt")
          return {
            id: optionId,
            title: o.title,
            product_id: product.id,
            values: (o.values ?? []).map((value: string) => ({
              id: uid("optval"),
              value,
              option_id: optionId,
            })),
          }
        })
        for (const raw of input.variants ?? []) {
          const variantId = uid("variant"),
            prices = (raw.prices ?? []).map((price: Document) => ({
              id: uid("price"),
              currency_code: price.currency_code,
              amount: safeMoney(price.amount),
            }))
          product.variants.push({
            ...raw,
            id: variantId,
            product_id: product.id,
            prices,
            options: product.options.flatMap((option: Document) =>
              option.values
                .filter(
                  (value: Document) =>
                    value.value === raw.options?.[option.title]
                )
                .map((value: Document) => ({ ...value, option }))
            ),
            manage_inventory: raw.manage_inventory ?? true,
          })
          await db
            .collection("inventory")
            .insertOne(
              { id: variantId, variant_id: variantId, stock: 0, reserved: 0 },
              { session }
            )
        }
      }
    }
    product.variants = product.variants.map((variant: Document) => {
      const price = variant.prices?.find(
        (p: Document) => p.currency_code === "vnd"
      )
      return price
        ? {
            ...variant,
            calculated_price: {
              id: price.id,
              currency_code: "vnd",
              calculated_amount: Number(price.amount),
              original_amount: Number(price.amount),
              calculated_price: { price_list_type: null },
              original_price: { price_list_type: null },
            },
          }
        : variant
    })
    product.updated_at = new Date()
    const { _id, ...saved } = product
    await db
      .collection("products")
      .replaceOne({ id: product.id }, saved, { session, upsert: true })
    return product.id
  })
  const product = (
    await hydrateProducts([
      (await db.collection("products").findOne({ id: savedId })) as Document,
    ])
  )[0]
  return path[2] === "variants"
    ? {
        variant: path[3]
          ? product.variants.find((v: Document) => v.id === path[3])
          : product.variants.at(-1),
        product,
      }
    : { product }
}

export async function originalAdmin(request: Request, path: string[]) {
  try {
    const origin = request.headers.get("origin")
    if (
      request.method !== "GET" &&
      origin &&
      origin !== new URL(request.url).origin
    )
      throw new ApiError(403, "Invalid origin")
    const authed = adminRequest(request),
      actor = await authenticate(authed, "admin")
    const url = new URL(request.url),
      db = await database(),
      method = request.method
    const [resource, id, action] = path
    if (resource === "layouts") {
      const collection = db.collection("admin_layout_configurations")
      const hidden = Object.fromEntries(
        ["/don-san", "/promotions", "/price-lists"].map((route) => [
          `core:nav:${route}`,
          { hidden: true },
        ])
      )
      // Apply the current navigation choice to saved personal layouts as well.
      // Otherwise a previous layout can keep Orders hidden after restoration.
      const navigation = { ...hidden, "core:nav:/orders": { hidden: false } }
      const withNavigation = (row: Document) => {
        const result = strip(row)
        if (row.zone !== "sidebar") return result
        const widgets = { ...(row.configuration?.widgets ?? {}) }
        for (const [key, preference] of Object.entries(navigation))
          widgets[key] = { ...widgets[key], ...preference }
        return { ...result, configuration: { ...row.configuration, widgets } }
      }
      if (id === "configurations" && method === "GET") {
        const rows = await collection
          .find({ user_id: { $in: [actor.id, null] } })
          .toArray()
        return json({
          layout_configurations: rows.map(withNavigation),
          count: rows.length,
          offset: 0,
          limit: rows.length,
        })
      }
      if (!id || action !== "configuration")
        throw new ApiError(404, "Layout not found")
      const zone = id
      if (method === "POST") {
        const input = await body(authed)
        const widgets = (
          input.configuration as
            | { widgets?: Record<string, unknown> }
            | undefined
        )?.widgets
        if (!widgets || typeof widgets !== "object" || Array.isArray(widgets))
          throw new ApiError(400, "Invalid layout configuration")
        for (const preference of Object.values(widgets)) {
          if (!preference || typeof preference !== "object")
            throw new ApiError(400, "Invalid widget preference")
        }
        const user_id = input.is_default === true ? null : actor.id
        const key = `layout:${zone}:${user_id ?? "default"}`
        await collection.updateOne(
          { id: key },
          {
            $set: {
              zone,
              user_id,
              is_system_default: user_id === null,
              configuration: { widgets },
              updated_at: new Date(),
            },
            $setOnInsert: { id: key, created_at: new Date() },
          },
          { upsert: true }
        )
      } else if (method === "DELETE") {
        await collection.deleteOne({ zone, user_id: actor.id })
      } else if (method !== "GET") throw new ApiError(405, "Method not allowed")
      const personal = await collection.findOne({ zone, user_id: actor.id })
      const storedDefault = await collection.findOne({ zone, user_id: null })
      const defaults = storedDefault
        ? strip(storedDefault)
        : {
            id: `layout:${zone}:default`,
            zone,
            user_id: null,
            is_system_default: true,
            configuration: { widgets: zone === "sidebar" ? hidden : {} },
            created_at: "2026-10-25T00:00:00.000Z",
            updated_at: "2026-10-25T00:00:00.000Z",
          }
      return json({
        personal_configuration: personal ? withNavigation(personal) : null,
        default_configuration: withNavigation(defaults),
        active_scope: personal ? "personal" : "default",
      })
    }
    if (resource === "marketplace") {
      let forwarded = authed
      if (method === "POST" && id === "artisans" && path.length === 2) {
        const input = await body(authed)
        input.pickup_province_name ??= provinceName(
          String(input.pickup_address ?? "")
            .split(",")
            .at(-1)
            ?.trim()
        )
        if (!input.pickup_province_name)
          throw new ApiError(
            400,
            "Enter the pickup province or city at the end of the pickup address, separated by a comma"
          )
        forwarded = new Request(authed.url, {
          method,
          headers: authed.headers,
          body: JSON.stringify(input),
        })
      }
      const response = await (
        { GET, POST, DELETE } as Record<string, typeof GET>
      )[method]?.(forwarded, {
        params: Promise.resolve({ path: ["admin", ...path] }),
      })
      if (!response) throw new ApiError(405, "Method not allowed")
      return response
    }
    if (resource === "uploads" && method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > 4 * 1024 * 1024)
        throw new ApiError(
          413,
          "Use images smaller than 4 MB when uploading from Medusa Admin"
        )
      const form = await authed.formData()
      const files = form.getAll("files")
      const saved = []
      for (const file of files) {
        if (!(file instanceof File) || file.size > 4 * 1024 * 1024)
          throw new ApiError(400, "Invalid image or file larger than 4 MB")
        const signed = await uploads(
          new Request(request.url, {
            method: "POST",
            body: JSON.stringify({
              filename: file.name,
              mime_type: file.type,
              size: file.size,
            }),
          }),
          ["artisan", "uploads", "sign"],
          { id: actor.id! }
        )
        if (!signed?.upload_url || !signed.id || !signed.headers)
          throw new ApiError(502, "Unable to create an image upload session")
        const response = await fetch(signed.upload_url, {
          method: "PUT",
          headers: signed!.headers,
          body: file,
        })
        if (!response.ok)
          throw new ApiError(502, "Unable to upload the image to storage")
        const done = await uploads(
          new Request(request.url, { method: "POST", body: "{}" }),
          ["artisan", "uploads", signed.id, "complete"],
          { id: actor.id! }
        )
        saved.push(done!.file)
      }
      return json({ files: saved })
    }
    const input = method === "POST" ? await body(authed) : {}
    if (resource === "users") {
      if (id === "me" && method === "GET")
        return json({
          user: {
            ...strip(
              (await db.collection("users").findOne({ id: actor.id })) ?? {
                id: actor.id,
                email: actor.email,
              }
            ),
            roles: [],
          },
        })
      if (method !== "GET")
        throw new ApiError(
          501,
          "Admin account management has not been migrated"
        )
      if (action === "auth-providers")
        return json({ auth_providers: ["emailpass"] })
      const rows = await db
        .collection("users")
        .find(id ? { id } : {})
        .toArray()
      return json(
        id
          ? { user: rows[0] ? strip(rows[0]) : null }
          : { users: rows.map(strip), count: rows.length, limit: 20, offset: 0 }
      )
    }
    if (resource === "views") {
      const views = await db
        .collection("admin_views")
        .find({ admin_id: actor.id })
        .toArray()
      return json({
        views: views.map(strip),
        count: views.length,
        limit: 100,
        offset: 0,
      })
    }
    if (resource === "feature-flags") return json({ feature_flags: {} })
    if (resource === "notifications") {
      const notifications = (await archived("notification")).filter(
        (row) => row.channel === "feed"
      )
      const { limit, offset } = paging(url)
      return json({
        notifications: notifications.slice(offset, offset + limit),
        count: notifications.length,
        limit,
        offset,
      })
    }
    if (resource === "locales") {
      const locales = await db
        .collection("locales")
        .find({}, { projection: { _id: 0 } })
        .toArray()
      return json({ locales, count: locales.length, limit: 100, offset: 0 })
    }
    if (resource === "currencies") {
      const currencies = await archived("currency")
      const selected = currencies.filter(
        (c) =>
          !url.searchParams.get("code") ||
          c.code === url.searchParams.get("code")
      )
      return json({
        currencies: selected,
        count: selected.length,
        limit: 100,
        offset: 0,
      })
    }
    if (resource === "stores") {
      const rows = await entityRows({
        collection: "admin_stores",
        key: "stores",
        table: "store",
        fields: [],
      })
      const regions = await db.collection("regions").find({}).toArray()
      const stores: Document[] = rows.map((store) => ({
        ...store,
        supported_currencies:
          store.supported_currencies ??
          [...new Set(regions.map((r) => r.currency_code))].map((code) => ({
            currency_code: code,
            is_default: true,
          })),
        supported_locales: store.supported_locales ?? [],
      }))
      if (method === "POST" && id) {
        const changes: Document = {}
        for (const key of [
          "name",
          "metadata",
          "supported_currencies",
          "supported_locales",
          "default_region_id",
          "default_sales_channel_id",
          "default_location_id",
        ])
          if (input[key] !== undefined) changes[key] = input[key]
        await db
          .collection("admin_stores")
          .updateOne(
            { id },
            { $set: { ...changes, id, updated_at: new Date() } },
            { upsert: true }
          )
        return json({
          store: { ...stores.find((s) => s.id === id), ...changes },
        })
      }
      return json(
        id
          ? { store: stores.find((s) => s.id === id) }
          : { stores, count: stores.length, limit: 100, offset: 0 }
      )
    }
    if (resource === "products")
      return json(await productApi(authed, path, input, url))
    if (resource === "customers") {
      const { limit, offset } = paging(url),
        filter = {
          ...listFilter(url, ["first_name", "last_name", "email"]),
          ...(id ? { id } : {}),
        }
      if (method === "GET") {
        const rows = await db
          .collection("customers")
          .find(filter)
          .skip(offset)
          .limit(limit)
          .toArray()
        return json(
          id
            ? { customer: rows[0] ? strip(rows[0]) : null }
            : {
                customers: rows.map(strip),
                count: await db.collection("customers").countDocuments(filter),
                limit,
                offset,
              }
        )
      }
      if (method === "POST" && !action) {
        const changes: Document = {}
        for (const key of [
          "first_name",
          "last_name",
          "phone",
          "company_name",
          "metadata",
        ])
          if (input[key] !== undefined) changes[key] = input[key]
        const customerId = id ?? uid("cus")
        if (!id) {
          changes.email = text(input.email, "email")
          changes.has_account = false
          changes.addresses = []
          changes.created_at = new Date()
        }
        await db
          .collection("customers")
          .updateOne(
            { id: customerId },
            { $set: { ...changes, updated_at: new Date() } },
            { upsert: !id }
          )
        return json({
          customer: strip(
            (await db.collection("customers").findOne({ id: customerId }))!
          ),
        })
      }
    }
    if (resource === "shipping-options" && method === "GET") {
      const locationId = url.searchParams.get("stock_location_id") ?? undefined
      const options = (await adminShippingOptions(db, locationId)).filter(
        (option) => option.service_zone?.fulfillment_set?.location
      )
      const { limit, offset } = paging(url)
      if (id) {
        const option = options.find((option) => option.id === id)
        if (!option)
          throw new ApiError(
            404,
            "Shipping option or warehouse configuration not found"
          )
        return json({ shipping_option: option })
      }
      const query = url.searchParams.get("q")?.toLowerCase()
      const selected = options.filter(
        (option) => !query || option.name?.toLowerCase().includes(query)
      )
      return json({
        shipping_options: selected.slice(offset, offset + limit),
        count: selected.length,
        limit,
        offset,
      })
    }
    if (resource === "reservations" && method === "GET") {
      const lineIds = [...url.searchParams.entries()]
        .filter(
          ([key]) => key === "line_item_id" || key.startsWith("line_item_id[")
        )
        .map(([, value]) => value)
      const { limit, offset } = paging(url)
      const filter = lineIds.length ? { line_item_id: { $in: lineIds } } : {}
      const rows = await db
        .collection("reservations")
        .find(filter)
        .skip(offset)
        .limit(limit)
        .toArray()
      const stock = await db
        .collection("inventory")
        .find({ variant_id: { $in: rows.map((row) => row.variant_id) } })
        .toArray()
      return json({
        reservations: rows.map((row) => ({
          ...strip(row),
          inventory_item_id:
            stock.find((item) => item.variant_id === row.variant_id)?.id ??
            row.variant_id ??
            row.inventory_item_id,
        })),
        count: await db.collection("reservations").countDocuments(filter),
        limit,
        offset,
      })
    }
    if (
      resource === "orders" &&
      id &&
      action === "fulfillments" &&
      method === "POST"
    ) {
      await mutateAdminFulfillment(id, path, input, actor.id!)
      const order = await db.collection("orders").findOne({ id })
      return json({ order: (await hydrateAdminOrders([order!]))[0] })
    }
    if (resource === "orders" && method === "GET") {
      const { limit, offset } = paging(url),
        filter = { ...listFilter(url, ["email"]), ...(id ? { id } : {}) }
      const collectionStatuses: Record<string, string> = {
        completed: "captured",
        authorized: "authorized",
        partially_authorized: "partially_authorized",
        awaiting: "awaiting",
        canceled: "canceled",
        not_paid: "not_paid",
      }
      const [{ rows, counts }] = await db
        .collection("orders")
        .aggregate([
          {
            $addFields: {
              payment_status: {
                $ifNull: [
                  "$payment_status",
                  {
                    $switch: {
                      branches: Object.entries(collectionStatuses).map(
                        ([source, target]) => ({
                          case: { $eq: ["$payment_collection.status", source] },
                          then: target,
                        })
                      ),
                      default: "not_paid",
                    },
                  },
                ],
              },
              fulfillment_status: {
                $ifNull: ["$fulfillment_status", "not_fulfilled"],
              },
            },
          },
          { $match: filter },
          {
            $facet: {
              rows: [
                { $sort: { created_at: -1 } },
                { $skip: offset },
                { $limit: limit },
                {
                  $lookup: {
                    from: "customers",
                    localField: "customer_id",
                    foreignField: "id",
                    as: "customer",
                  },
                },
                {
                  $unwind: {
                    path: "$customer",
                    preserveNullAndEmptyArrays: true,
                  },
                },
              ],
              counts: [{ $count: "total" }],
            },
          },
        ])
        .toArray()
      const orders = await hydrateAdminOrders(rows)
      return json(
        id
          ? { order: orders[0] }
          : {
              orders,
              count: counts[0]?.total ?? 0,
              limit,
              offset,
            }
      )
    }
    if (resource === "inventory-items") {
      const { limit, offset } = paging(url),
        rows = await db
          .collection("inventory")
          .find({
            deleted_at: null,
            ...(id ? { $or: [{ id }, { variant_id: id }] } : {}),
          })
          .skip(offset)
          .limit(limit)
          .toArray()
      const products = await db
        .collection("products")
        .find({ "variants.id": { $in: rows.map((r) => r.variant_id) } })
        .toArray()
      const inventory_items = rows.map((row) => {
        const product = products.find((p) =>
          p.variants?.some((v: Document) => v.id === row.variant_id)
        )
        const variant = product?.variants.find(
          (v: Document) => v.id === row.variant_id
        )
        return {
          ...strip(row),
          id: row.id ?? row.variant_id,
          title: variant?.title ?? product?.title,
          sku: variant?.sku ?? null,
          stocked_quantity: row.stock,
          reserved_quantity: row.reserved,
          location_levels: [
            {
              id: row.id ?? row.variant_id,
              stocked_quantity: row.stock,
              reserved_quantity: row.reserved,
              available_quantity: Number(row.stock) - Number(row.reserved),
            },
          ],
        }
      })
      if (method === "GET")
        return json(
          action === "location-levels"
            ? {
                inventory_levels: inventory_items[0]?.location_levels ?? [],
                count: inventory_items[0]?.location_levels.length ?? 0,
                limit,
                offset,
              }
            : id
            ? { inventory_item: inventory_items[0] }
            : {
                inventory_items,
                count: await db
                  .collection("inventory")
                  .countDocuments({ deleted_at: null }),
                limit,
                offset,
              }
        )
      if (method === "POST" && id && action === "location-levels") {
        const stock = safeMoney(input.stocked_quantity)
        const result = await db
          .collection("inventory")
          .updateOne(
            { $or: [{ id }, { variant_id: id }], reserved: { $lte: stock } },
            { $set: { stock } }
          )
        if (!result.matchedCount)
          throw new ApiError(
            409,
            "Stock is lower than the reserved quantity, or the product was not found"
          )
        return json({
          inventory_item: { ...inventory_items[0], stocked_quantity: stock },
        })
      }
    }
    if (mappings[resource]) {
      if (
        method !== "GET" &&
        [
          "promotions",
          "campaigns",
          "price-lists",
          "tax-regions",
          "tax-rates",
          "shipping-options",
        ].includes(resource)
      )
        throw new ApiError(
          501,
          "This action is not fully connected to MongoDB checkout"
        )
      const mapping = mappings[resource],
        { limit, offset } = paging(url),
        rows = await entityRows(mapping)
      if (method === "GET") {
        const q = url.searchParams.get("q")?.toLowerCase()
        const selected = rows.filter(
          (row) =>
            (!id || row.id === id) &&
            (!q ||
              String(row.name ?? row.title ?? row.value ?? "")
                .toLowerCase()
                .includes(q))
        )
        const single =
          mapping.key === "product_categories"
            ? "product_category"
            : mapping.key.slice(0, -1)
        return json(
          id
            ? { [single]: selected[0] }
            : {
                [mapping.key]: selected.slice(offset, offset + limit),
                count: selected.length,
                limit,
                offset,
              }
        )
      }
      if (!mapping.fields.length && method !== "GET")
        throw new ApiError(405, "Read-only provider")
      const entityId = id ?? uid(resource.replaceAll("-", "_")),
        current = rows.find((row) => row.id === entityId)
      if (id && !current) throw new ApiError(404, "Not found")
      if (method === "DELETE") {
        await db
          .collection(mapping.collection)
          .updateOne(
            { id: entityId },
            { $set: { ...(current ?? {}), deleted_at: new Date() } },
            { upsert: true }
          )
        return json({
          id: entityId,
          object: mapping.key.slice(0, -1),
          deleted: true,
        })
      }
      if (method === "POST" && !action) {
        const changes: Document = {}
        for (const key of mapping.fields)
          if (input[key] !== undefined) changes[key] = input[key]
        const entity = {
          ...(current ?? {}),
          ...changes,
          id: entityId,
          updated_at: new Date(),
          created_at: current?.created_at ?? new Date(),
        }
        await db
          .collection(mapping.collection)
          .replaceOne({ id: entityId }, entity, { upsert: true })
        return json({
          [mapping.key === "product_categories"
            ? "product_category"
            : mapping.key.slice(0, -1)]: entity,
        })
      }
    }
    throw new ApiError(
      501,
      `Admin feature has not been migrated: ${method} /admin/${path.join("/")}`
    )
  } catch (error) {
    return errorResponse(error)
  }
}
