import { randomUUID } from "node:crypto"
import type { Document } from "mongodb"
import { cartActor, ownedCart, cartTotals } from "./carts"
import { database, transaction } from "./mongodb"
import { ApiError, body, text } from "./http"
import { provinceCode } from "../lib/vietnam-provinces"
import { regionalFee, REGIONAL_SHIPPING } from "./regional-shipping"

export async function quoteCart(cart: Document) {
  const db = await database()
  const destination = cart.shipping_address?.province
  if (!provinceCode(destination)) throw new ApiError(400, "Please select a valid delivery province or city")
  if (!cart.items?.length) throw new ApiError(400, "Your cart is empty")
  const products = await db.collection("products").find({ id: { $in: cart.items.map((item: Document) => item.product_id) } }).toArray()
  const house = await db.collection("artisans").findOne({ handle: "yarnly" })
  const groups = new Map<string, { key: string; artisan_id: string; custom_request_id: string | null; items: Document[] }>()
  for (const item of cart.items) {
    const product = products.find((product) => product.id === item.product_id)
    const artisanId = product?.artisan_id ?? house?.id
    if (!artisanId) throw new ApiError(409, "A product has no assigned artisan")
    const custom = item.metadata?.custom_request_id ?? null
    const key = custom ? `custom:${custom}` : artisanId
    let parcel = groups.get(key)
    if (!parcel) parcel = { key, artisan_id: artisanId, custom_request_id: custom, items: [] }
    parcel.items.push(item); groups.set(key, parcel)
  }
  if (groups.size > 30) throw new ApiError(400, "Your cart contains too many parcels")
  const artisans = await db.collection("artisans").find({ id: { $in: [...groups.values()].map((group) => group.artisan_id) } }).toArray()
  const parcels = await Promise.all([...groups.values()].map(async (group) => {
    const artisan = artisans.find((artisan) => artisan.id === group.artisan_id)
    if (!provinceCode(artisan?.pickup_province_name)) throw new ApiError(409, `Shop ${artisan?.shop_name ?? "responsible for this product"} has not provided a pickup province or city. Please contact the shop to update it`)
    const rate = regionalFee(artisan?.pickup_province_name, destination)
    return { key: group.key, artisan_id: group.artisan_id, custom_request_id: group.custom_request_id,
      line_item_ids: group.items.map((item) => item.id), ...rate }
  }))
  const quote = { id: `quote_${randomUUID()}`, cart_id: cart.id,
    policy: REGIONAL_SHIPPING.version, demo: false, cart_updated_at: cart.updated_at, parcels, amount: parcels.reduce((sum, parcel) => sum + parcel.fee, 0),
    expires_at: new Date(Date.now() + 15 * 60_000), created_at: new Date() }
  await db.collection("shipping_quotes").insertOne(quote)
  return quote
}

export async function shipping(request: Request, path: string[]) {
  const actor = await cartActor(request)
  const db = await database()
  const input = request.method === "POST" ? await body(request) : {}
  const url = new URL(request.url)
  if (path[0] === "shipping-options") {
    const cartId = text(request.method === "GET" ? url.searchParams.get("cart_id") : input.cart_id, "cart_id")
    const cart = await ownedCart(db, cartId, actor)
    const option = await db.collection("shipping_options").findOne({ deleted_at: null }, { projection: { _id: 0 } })
    if (!option || path[1] && path[1] !== option.id) throw new ApiError(404, "Shipping method not found", "not_found")
    if (request.method === "POST" && (path.length !== 3 || path[2] !== "calculate")) throw new ApiError(405, "Method not allowed")
    // Cart previews request options before checkout has a delivery address.
    // No quote is selectable until the required destination is present.
    if (request.method === "GET" && (!cart.items?.length || !provinceCode(cart.shipping_address?.province))) return { shipping_options: [] }
    const quote = await quoteCart(cart)
    const priced = { ...option, name: "Regional shipping", amount: quote.amount,
      calculated_price: { calculated_amount: quote.amount, original_amount: quote.amount, currency_code: cart.currency_code } }
    return request.method === "GET" ? { shipping_options: [priced] } : { shipping_option: priced }
  }
  if (path[0] === "carts" && path[1] && path[2] === "shipping-methods" && path.length === 3 && request.method === "POST") {
    const cart = await ownedCart(db, path[1], actor)
    const option = await db.collection("shipping_options").findOne({ id: text(input.option_id, "option_id"), deleted_at: null })
    if (!option) throw new ApiError(404, "Shipping method not found", "not_found")
    const quote = await quoteCart(cart)
    return transaction(async (db, session) => {
      const current = await ownedCart(db, cart.id, actor, session)
      if (+new Date(current.updated_at) !== +new Date(cart.updated_at)) throw new ApiError(409, "Your cart has changed. Please try again")
      const methods = [{ id: `casm_${randomUUID()}`, name: "Regional shipping", shipping_option_id: option.id,
        amount: quote.amount, quote_id: quote.id, data: { policy: quote.policy, parcels: quote.parcels.map(({ key, fee, region, origin_province, destination_province }) => ({ key, fee, region, origin_province, destination_province })) }, tax_lines: [] }]
      await db.collection("carts").updateOne({ id: cart.id }, { $set: { shipping_methods: methods } }, { session })
      return { cart: cartTotals({ ...current, shipping_methods: methods }) }
    })
  }
  return undefined
}
