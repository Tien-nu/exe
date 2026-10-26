import { randomUUID } from "node:crypto"
import type { Db, ClientSession, Document } from "mongodb"
import { authenticate, type Actor } from "./auth"
import { database, transaction } from "./mongodb"
import { ApiError, body, text } from "./http"
import { publicProduct, type Product } from "./catalog"
import { REGIONAL_SHIPPING } from "./regional-shipping"

const uid = (prefix: string) => `${prefix}_${randomUUID()}`
export function quantity(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100) throw new ApiError(400, "Quantity must be between 1 and 100")
  return value
}

export function cartTotals(cart: Document) {
  const items = (cart.items ?? []).map((item: Document) => ({ ...item,
    subtotal: item.unit_price * item.quantity, total: item.unit_price * item.quantity,
    original_total: item.unit_price * item.quantity, original_subtotal: item.unit_price * item.quantity,
    tax_total: 0, discount_total: 0,
  }))
  const itemTotal = items.reduce((sum: number, item: Document) => sum + item.total, 0)
  const shippingMethods = cart.completed_at === null ? (cart.shipping_methods ?? []).filter((method: Document) => method.data?.policy === REGIONAL_SHIPPING.version) : (cart.shipping_methods ?? [])
  const shippingTotal = shippingMethods.reduce((sum: number, method: Document) => sum + Number(method.amount), 0)
  if (!Number.isSafeInteger(itemTotal + shippingTotal)) throw new ApiError(400, "Invalid total")
  const { _id, migration_snapshot, ...publicCart } = cart
  return { ...publicCart, shipping_methods: shippingMethods, items, item_total: itemTotal, item_subtotal: itemTotal, subtotal: itemTotal,
    original_item_total: itemTotal, original_total: itemTotal + shippingTotal,
    shipping_total: shippingTotal, shipping_subtotal: shippingTotal, total: itemTotal + shippingTotal,
    tax_total: 0, item_tax_total: 0, shipping_tax_total: 0, discount_total: 0, discount_subtotal: 0,
    gift_card_total: 0, credit_line_total: 0, promotions: [],
  }
}

export async function cartActor(request: Request): Promise<Actor | null> {
  if (!request.headers.has("authorization")) return null
  return authenticate(request, "customer")
}

export async function ownedCart(db: Db, id: string, actor: Actor | null, session?: ClientSession, allowCompleted = false) {
  const cart = await db.collection("carts").findOne({ id }, { session })
  if (!cart || cart.customer_id && cart.customer_id !== actor?.id) throw new ApiError(404, "Cart not found", "not_found")
  if (!allowCompleted && cart.completed_at) throw new ApiError(409, "This cart has already been checked out")
  return cart
}

export async function pricedLine(db: Db, variantId: string, amount: number, currency: string, session: ClientSession) {
  const raw = await db.collection<Product>("products").findOne({ status: "published", deleted_at: null, "variants.id": variantId }, { session })
  if (!raw) throw new ApiError(404, "This product is no longer available", "not_found")
  if (raw.artisan_id) {
    const artisan = await db.collection("artisans").findOne({ id: raw.artisan_id, status: "active" }, { session })
    if (!artisan) throw new ApiError(409, "This shop is temporarily closed")
  }
  const variant = raw.variants?.find((variant: Document) => variant.id === variantId)
  if (!variant) throw new ApiError(404, "Variant not found", "not_found")
  const price = variant.prices?.find((price: Document) => price.currency_code === currency && !price.price_list_id && !price.rules_count)
  if (!price || !Number.isSafeInteger(Number(price.amount)) || Number(price.amount) < 0) throw new ApiError(409, "No applicable price found")
  const inventory = await db.collection("inventory").findOne({ variant_id: variantId }, { session })
  if (variant.manage_inventory && !variant.allow_backorder && (!inventory || inventory.stock - inventory.reserved < amount)) throw new ApiError(409, "Insufficient stock")
  const product = publicProduct(raw)
  return { id: uid("cali"), variant_id: variantId, product_id: raw.id, quantity: amount,
    title: raw.title, product_title: raw.title, product_handle: raw.handle, variant_title: variant.title,
    thumbnail: raw.thumbnail ?? null, unit_price: Number(price.amount), product,
    variant: product.variants.find((variant) => variant.id === variantId), metadata: {},
  }
}

function address(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Invalid address")
  const row = input as Record<string, unknown>
  const result: Document = {}
  for (const key of ["first_name", "last_name", "company", "address_1", "address_2", "city", "province", "postal_code", "country_code", "phone"]) {
    if (row[key] == null) result[key] = null
    else if (typeof row[key] === "string" && row[key].length <= 500) result[key] = row[key].trim()
    else throw new ApiError(400, `Invalid ${key}`)
  }
  return result
}

export async function carts(request: Request, path: string[]) {
  const actor = await cartActor(request)
  const db = await database()
  const method = request.method
  const id = path[1]
  const input = method === "POST" ? await body(request) : {}
  if (path.length === 1 && method === "POST") {
    const region = await db.collection("regions").findOne({ id: text(input.region_id, "region_id") }, { projection: { _id: 0 } })
    if (!region || region.currency_code !== "vnd") throw new ApiError(400, "Invalid region")
    const cart = { id: uid("cart"), region_id: region.id, region, currency_code: region.currency_code,
      customer_id: actor?.id ?? null, email: actor?.email ?? null, items: [], shipping_methods: [],
      metadata: {}, promotions: [], completed_at: null, created_at: new Date(), updated_at: new Date(),
      locale: typeof input.locale === "string" ? input.locale.slice(0, 20) : null,
    }
    await db.collection("carts").insertOne(cart)
    return { cart: cartTotals(cart) }
  }
  if (!id) throw new ApiError(404, "Not found", "not_found")
  if (method === "GET" && path.length === 2) return { cart: cartTotals(await ownedCart(db, id, actor, undefined, true)) }
  return transaction(async (db, session) => {
    const cart = await ownedCart(db, id, actor, session)
    const previousUpdatedAt = cart.updated_at
    const previousDestination = { district_id: cart.metadata?.district_id, ward_code: cart.metadata?.ward_code }
    let changed = false
    if (method === "POST" && path.length === 2) {
      for (const field of ["shipping_address", "billing_address"]) if (input[field] !== undefined) { cart[field] = address(input[field]); changed = true }
      if (input.email !== undefined) {
        const email = text(input.email, "email", 254).toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Invalid email")
        cart.email = email; changed = true
      }
      if (input.locale !== undefined) { cart.locale = text(input.locale, "locale", 20); changed = true }
      if (input.region_id !== undefined) {
        const region = await db.collection("regions").findOne({ id: text(input.region_id, "region_id"), currency_code: cart.currency_code }, { session, projection: { _id: 0 } })
        if (!region) throw new ApiError(400, "Invalid region")
        cart.region_id = region.id; cart.region = region; changed = true
      }
      if (input.metadata !== undefined) {
        if (!input.metadata || typeof input.metadata !== "object" || Array.isArray(input.metadata)) throw new ApiError(400, "Invalid metadata")
        const metadata = input.metadata as Record<string, unknown>
        for (const key of ["payment_method", "district_id", "ward_code", "province_id", "province_name", "district_name", "ward_name"]) {
          if (metadata[key] === undefined) continue
          if (!["string", "number"].includes(typeof metadata[key])) throw new ApiError(400, `Invalid ${key}`)
          if (key === "payment_method" && metadata[key] !== "manual_bank") throw new ApiError(400, "Bank transfer is required. Please select bank transfer to continue.")
          if (String(metadata[key]).length > 200) throw new ApiError(400, "Metadata too long")
          cart.metadata = { ...cart.metadata, [key]: metadata[key] }
        }
        changed = true
      }
      if (input.promo_codes !== undefined) {
        if (!Array.isArray(input.promo_codes) || input.promo_codes.length) throw new ApiError(409, "Promotion codes have not been configured")
        changed = true
      }
      const metadataInput = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}
      if (input.shipping_address !== undefined || input.region_id !== undefined ||
          (["district_id", "ward_code"] as const).some((key) => metadataInput[key] !== undefined && String(metadataInput[key]) !== String(previousDestination[key]))) cart.shipping_methods = []
    }
    if (path[2] === "customer" && method === "POST" && path.length === 3) {
      if (!actor?.id) throw new ApiError(401, "Unauthorized", "unauthorized")
      cart.customer_id = actor.id; cart.email = actor.email; changed = true
    }
    if (path[2] === "line-items") {
      const itemId = path[3]
      if (!itemId && method === "POST" && path.length === 3) {
        if (cart.items.length >= 100) throw new ApiError(400, "Too many items in the cart")
        const variantId = text(input.variant_id, "variant_id")
        const previous = cart.items.find((item: Document) => item.variant_id === variantId && !item.metadata?.custom_request_id)
        const amount = quantity(quantity(input.quantity) + (previous?.quantity ?? 0))
        const line = await pricedLine(db, variantId, amount, cart.currency_code, session)
        if (previous) cart.items = cart.items.map((item: Document) => item.id === previous.id ? { ...line, id: previous.id } : item)
        else cart.items.push(line)
        changed = true
      } else if (itemId && path.length === 4 && ["POST", "DELETE"].includes(method)) {
        const current = cart.items.find((item: Document) => item.id === itemId)
        if (!current) throw new ApiError(404, "Cart item not found", "not_found")
        if (method === "DELETE") cart.items = cart.items.filter((item: Document) => item.id !== itemId)
        else {
          if (current.metadata?.custom_request_id) throw new ApiError(409, "Custom quantity is fixed by the accepted quote")
          const line = await pricedLine(db, current.variant_id, quantity(input.quantity), cart.currency_code, session)
          cart.items = cart.items.map((item: Document) => item.id === itemId ? { ...line, id: itemId } : item)
        }
        changed = true
      }
      if (changed) cart.shipping_methods = []
    }
    if (!changed) throw new ApiError(405, "Method not allowed")
    cart.updated_at = new Date()
    // Payment/contact metadata does not change the parcel or invalidate its
    // price. Keep an existing quote bound to this unchanged shipping context.
    const quoteIds = (cart.shipping_methods ?? []).map((method: Document) => method.quote_id).filter(Boolean)
    if (quoteIds.length) await db.collection("shipping_quotes").updateMany({ id: { $in: quoteIds }, cart_id: id, cart_updated_at: previousUpdatedAt }, { $set: { cart_updated_at: cart.updated_at } }, { session })
    const { _id, ...saved } = cart
    await db.collection("carts").replaceOne({ id, completed_at: null }, saved, { session })
    return { cart: cartTotals(saved) }
  })
}
