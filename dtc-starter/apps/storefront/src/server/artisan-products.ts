import { randomUUID } from "node:crypto"
import type { Document } from "mongodb"
import { artisanFor, slug, validate } from "./artisans"
import { database, transaction } from "./mongodb"
import { ApiError, body, pagination } from "./http"
import { CreateArtisanProductSchema, UpdateArtisanProductSchema } from "./validators"

const uid = (prefix: string) => `${prefix}_${randomUUID()}`
const money = (amount: number) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(400, "The VND price must be a positive integer")
  return amount
}
const calculated = (amount: number, id: string) => ({ id, currency_code: "vnd", calculated_amount: amount, original_amount: amount,
  calculated_price: { price_list_type: null }, original_price: { price_list_type: null } })

export async function productViews(products: Document[]) {
  const db = await database()
  const stocks = await db.collection("inventory").find({ variant_id: { $in: products.flatMap((product) => product.variants.map((variant: Document) => variant.id)) } }).toArray()
  return products.map((product) => ({ id: product.id, artisan_id: product.artisan_id, title: product.title, handle: product.handle, description: product.description,
    status: product.status, thumbnail: product.thumbnail, created_at: product.created_at,
    images: (product.images ?? []).map((image: Document) => image.url),
    categories: (product.categories ?? []).map((category: Document) => ({ id: category.id, name: category.name })),
    fulfillment_type: product.metadata?.fulfillment_type === "made_to_order" ? "made_to_order" : "ready",
    lead_days: product.metadata?.lead_days ?? null, hidden_by_lock: product.metadata?.hidden_by_lock === true,
    variants: product.variants.map((variant: Document) => {
      const stock = stocks.find((stock) => stock.variant_id === variant.id)
      return { id: variant.id, title: variant.title, price: Number(variant.prices?.find((price: Document) => price.currency_code === "vnd")?.amount ?? 0),
        stock: stock?.stock ?? 0, reserved: stock?.reserved ?? 0 }
    }),
  }))
}

export async function artisanProducts(request: Request, path: string[], authorizedArtisan?: Document) {
  if (path[0] !== "artisan" || !["products", "categories"].includes(path[1])) return undefined
  const artisan = authorizedArtisan ?? await artisanFor(request)
  const db = await database()
  if (path[1] === "categories" && request.method === "GET" && path.length === 2) return {
    categories: await db.collection("product_categories").find({ is_active: true, is_internal: { $ne: true } }, { projection: { _id: 0, id: 1, name: 1, handle: 1 } }).limit(100).toArray(),
  }
  const id = path[2]
  if (request.method === "GET" && path.length <= 3) {
    const { limit, offset } = pagination(new URL(request.url))
    const products = await db.collection("products").find({ artisan_id: artisan.id, deleted_at: null, ...(id ? { id } : {}) }).sort({ created_at: -1 }).skip(offset).limit(limit).toArray()
    const result = await productViews(products)
    if (id) {
      if (!result[0]) throw new ApiError(404, "Product not found", "not_found")
      return { product: result[0] }
    }
    return { products: result }
  }
  if (request.method === "DELETE" && id && path.length === 3) {
    return transaction(async (db, session) => {
      const product = await db.collection("products").findOneAndUpdate({ id, artisan_id: artisan.id, deleted_at: null }, { $set: { deleted_at: new Date(), status: "draft" } }, { session })
      if (!product) throw new ApiError(404, "Product not found", "not_found")
      return { id, object: "product", deleted: true }
    })
  }
  if (request.method !== "POST" || path.length > 3) throw new ApiError(405, "Method not allowed")
  const raw = await body(request)
  const input = id ? validate(UpdateArtisanProductSchema, raw) : validate(CreateArtisanProductSchema, raw)
  if (input.fulfillment_type === "made_to_order" && !(Number(input.lead_days) > 0)) throw new ApiError(400, "Made-to-order items require a positive production time")
  const productId = await transaction(async (db, session) => {
    // Serialize publishing with admin locking/unlocking this artisan.
    const active = await db.collection("artisans").updateOne({ id: artisan.id, status: "active" }, { $inc: { product_write_version: 1 } }, { session })
    if (!active.modifiedCount) throw new ApiError(403, "Your shop has been suspended", "not_allowed")
    const current = id ? await db.collection("products").findOne({ id, artisan_id: artisan.id, deleted_at: null }, { session }) : null
    if (id && !current) throw new ApiError(404, "Product not found", "not_found")
    const categoryIds = input.category_ids ?? current?.categories?.map((category: Document) => category.id) ?? []
    const categories = await db.collection("product_categories").find({ id: { $in: categoryIds }, is_active: true }, { session, projection: { _id: 0, id: 1, name: 1, handle: 1 } }).toArray()
    if (categories.length !== new Set(categoryIds).size) throw new ApiError(400, "Invalid category")
    const images = (input.images ?? current?.images?.map((image: Document) => image.url) ?? []).filter(Boolean)
    for (const image of images) {
      try { if (!["https:", "http:"].includes(new URL(image).protocol)) throw new Error() } catch { throw new ApiError(400, "Invalid image URL") }
    }
    const now = new Date(), productId = current?.id ?? uid("prod")
    let variants: Document[] = current?.variants ?? []
    let options: Document[] = current?.options ?? []
    if (!id && "price" in input) {
      const optionId = uid("opt"), valueId = uid("optval"), variantId = uid("variant"), priceId = uid("price")
      const amount = money(input.price)
      const option = { id: optionId, title: "Variant", product_id: productId, values: [{ id: valueId, value: "Standard", option_id: optionId }] }
      options = [option]
      variants = [{ id: variantId, product_id: productId, title: "Standard", manage_inventory: true,
        allow_backorder: input.fulfillment_type === "made_to_order", options: [{ ...option.values[0], option }],
        prices: [{ id: priceId, currency_code: "vnd", amount }], calculated_price: calculated(amount, priceId) }]
      await db.collection("inventory").insertOne({ id: variantId, variant_id: variantId,
        stock: input.fulfillment_type === "ready" ? Number(input.stock ?? 0) : 0, reserved: 0 }, { session })
    } else if ("variants" in input) {
      if (input.variants.some((variant) => !variants.some((existing) => existing.id === variant.id))) throw new ApiError(400, "This variant does not belong to this product")
      for (const update of input.variants) {
        const amount = money(update.price)
        const inventory = await db.collection("inventory").findOne({ variant_id: update.id }, { session })
        if (input.fulfillment_type === "ready" && update.stock != null) {
          if (update.stock < Number(inventory?.reserved ?? 0)) throw new ApiError(409, "Stock cannot be lower than the quantity reserved for orders")
          await db.collection("inventory").updateOne({ variant_id: update.id }, { $set: { stock: update.stock } }, { session })
        }
        variants = variants.map((variant) => variant.id === update.id ? { ...variant, allow_backorder: input.fulfillment_type === "made_to_order",
          prices: [{ id: variant.prices?.[0]?.id ?? uid("price"), currency_code: "vnd", amount }], calculated_price: calculated(amount, variant.prices?.[0]?.id ?? variant.id) } : variant)
      }
    }
    const product = { ...(current ?? {}), id: productId, artisan_id: artisan.id, handle: current?.handle ?? `${slug(input.title) || "product"}-${productId.slice(-8)}`,
      title: input.title, description: input.description ?? null, status: current?.metadata?.hidden_by_lock ? "draft" : input.status ?? "published",
      thumbnail: images[0] ?? null, images: images.map((url: string) => ({ id: uid("img"), url })), categories, options, variants,
      metadata: { ...current?.metadata, fulfillment_type: input.fulfillment_type, lead_days: input.fulfillment_type === "made_to_order" ? Number(input.lead_days) : null },
      created_at: current?.created_at ?? now, updated_at: now, deleted_at: null,
    }
    const { _id, ...saved } = product as Document
    await db.collection("products").replaceOne({ id: productId }, saved, { session, upsert: true })
    return productId
  })
  const product = await db.collection("products").findOne({ id: productId })
  return { product: (await productViews([product!]))[0] }
}
