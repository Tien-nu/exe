import type { Document, Filter } from "mongodb"
import { database } from "./mongodb"
import { ApiError, pagination } from "./http"

export type Product = Document & {
  id: string; status: string; handle: string; title: string
  variants?: Document[]; metadata?: Record<string, unknown>
}

// Explicit public projection: importing a raw SQL snapshot must never expose
// internal columns, costs, seller bank details, or authentication metadata.
export function publicProduct(product: Product) {
  const fields = ["id", "title", "subtitle", "description", "handle", "thumbnail",
    "created_at", "updated_at", "collection_id", "collection", "type", "type_id",
    "tags", "categories", "images", "options", "weight", "length", "height", "width",
    "origin_country", "material", "is_giftcard", "discountable"]
  const result = Object.fromEntries(fields.filter((key) => product[key] !== undefined).map((key) => [key, product[key]]))
  return {
    ...result,
    metadata: {
      fulfillment_type: product.metadata?.fulfillment_type,
      lead_days: product.metadata?.lead_days,
    },
    variants: (product.variants ?? []).map((variant) => ({
      id: variant.id, product_id: product.id, title: variant.title,
      sku: variant.sku, options: variant.options ?? [], images: variant.images ?? [],
      manage_inventory: variant.manage_inventory ?? true,
      allow_backorder: variant.allow_backorder ?? false,
      inventory_quantity: Math.max(0, Number(variant.stock ?? 0) - Number(variant.reserved ?? 0)),
      calculated_price: variant.calculated_price,
      prices: variant.prices ?? [],
    })),
  }
}

async function currentStock(products: Product[]) {
  const db = await database()
  const ids = products.flatMap((product) => (product.variants ?? []).map((variant) => variant.id))
  const inventory = await db.collection("inventory").find({ variant_id: { $in: ids } }).toArray()
  const byVariant = new Map(inventory.map((row) => [row.variant_id, row]))
  return products.map((product) => ({ ...product, variants: (product.variants ?? []).map((variant) => {
    const stock = byVariant.get(variant.id)
    return stock ? { ...variant, stock: stock.stock, reserved: stock.reserved } : variant
  }) }))
}

function values(url: URL, name: string) {
  return [...url.searchParams.getAll(name), ...url.searchParams.getAll(`${name}[]`)]
    .flatMap((value) => value.split(",")).filter(Boolean).slice(0, 100)
}

export function productFilter(url: URL): Filter<Product> {
  const filter: Filter<Product> = { status: "published", deleted_at: null }
  for (const [param, field] of [["id", "id"], ["handle", "handle"], ["collection_id", "collection_id"],
    ["category_id", "categories.id"], ["tag_id", "tags.id"], ["option_value_id", "variants.options.id"]]) {
    const list = values(url, param)
    if (list.length) filter[field] = { $in: list }
  }
  const query = url.searchParams.get("q")
  if (query) {
    if (query.length > 200) throw new ApiError(400, "Search query too long")
    // Escape regex metacharacters; never accept a user-supplied Mongo filter.
    filter.title = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
  }
  return filter
}

export async function catalog(path: string[], url: URL): Promise<unknown | undefined> {
  const [resource, id] = path
  if (!["products", "product-variants", "regions", "product-categories", "collections", "locales", "artisans"].includes(resource)) return
  const db = await database()
  const { limit, offset } = pagination(url)
  if (resource === "products") {
    const filter = productFilter(url)
    if (id) filter.id = id
    const products = db.collection<Product>("products")
    if (id) {
      const product = await products.findOne(filter)
      if (!product) throw new ApiError(404, "Product not found", "not_found")
      return { product: publicProduct((await currentStock([product]))[0]) }
    }
    const order = url.searchParams.get("order") ?? "-created_at"
    const descending = order.startsWith("-")
    const field = order.replace(/^-/, "")
    if (!["created_at", "title", "updated_at"].includes(field)) throw new ApiError(400, "Unsupported sort order")
    const [rows, count] = await Promise.all([
      products.find(filter).sort({ [field]: descending ? -1 : 1, id: 1 }).skip(offset).limit(limit).toArray(),
      products.countDocuments(filter),
    ])
    return { products: (await currentStock(rows)).map(publicProduct), count, limit, offset }
  }
  if (resource === "product-variants") {
    if (!id) throw new ApiError(404, "Not found", "not_found")
    const product = await db.collection<Product>("products").findOne({ ...productFilter(new URL(url.origin)), "variants.id": id })
    const variant = product && publicProduct((await currentStock([product]))[0]).variants.find((variant) => variant.id === id)
    if (!variant) throw new ApiError(404, "Not found", "not_found")
    return { variant }
  }
  if (resource === "artisans") {
    // Product -> shop lookup and shop page expose only public shop fields.
    let filter: Document = { status: "active" }
    if (id === "by-product" && path[2]) {
      const product = await db.collection("products").findOne({ id: path[2], status: "published", deleted_at: null })
      if (!product?.artisan_id) return { artisan: null, fulfillment_type: product?.metadata?.fulfillment_type ?? "ready", lead_days: product?.metadata?.lead_days ?? null }
      filter.id = product.artisan_id
    } else if (id) filter.handle = id
    const projection = { _id: 0, id: 1, handle: 1, shop_name: 1, description: 1, avatar_url: 1 }
    if (id) {
      const artisan = await db.collection("artisans").findOne(filter, { projection })
      if (!artisan) throw new ApiError(404, "Shop not found", "not_found")
      const products = await db.collection<Product>("products").find({ artisan_id: artisan.id, status: "published", deleted_at: null }).limit(100).toArray()
      if (id === "by-product") {
        const product = await db.collection<Product>("products").findOne({ id: path[2], status: "published", deleted_at: null })
        return { artisan, fulfillment_type: product?.metadata?.fulfillment_type ?? "ready", lead_days: product?.metadata?.lead_days ?? null }
      }
      return { artisan, product_ids: products.map((product) => product.id), products: (await currentStock(products)).map(publicProduct) }
    }
    return { artisans: await db.collection("artisans").find(filter, { projection }).skip(offset).limit(limit).toArray() }
  }
  const collection = resource === "product-categories" ? "product_categories" : resource
  const key = collection
  const filter: Document = { deleted_at: null }
  if (id) filter.id = id
  if (url.searchParams.has("handle")) filter.handle = url.searchParams.get("handle")
  if (resource === "product-categories") {
    filter.is_active = true
    filter.is_internal = { $ne: true }
  }
  const projection = resource === "regions"
    ? { _id: 0, id: 1, name: 1, currency_code: 1, countries: 1, automatic_taxes: 1, payment_providers: 1 }
    : resource === "locales" ? { _id: 0, code: 1, name: 1 }
    : { _id: 0, id: 1, name: 1, title: 1, handle: 1, parent_category_id: 1, category_children: 1, parent_category: 1 }
  const rows = db.collection(collection)
  if (id) {
    const row = await rows.findOne(filter, { projection })
    if (!row) throw new ApiError(404, "Not found", "not_found")
    return { [resource === "product-categories" ? "product_category" : resource.slice(0, -1)]: row }
  }
  const [items, count] = await Promise.all([
    rows.find(filter, { projection }).skip(offset).limit(limit).toArray(), rows.countDocuments(filter),
  ])
  return { [key]: items, count, limit, offset }
}
