import { simulatedPaymentsEnabled } from "./qr-payment-token"
import { randomUUID } from "node:crypto"
import type { Document } from "mongodb"
import { database, transaction } from "./mongodb"
import { cartActor, ownedCart, cartTotals, pricedLine } from "./carts"
import { ApiError, body, text } from "./http"
import { PAYMENT_WINDOW } from "./domain/order-rules"
import { regionalFee, REGIONAL_SHIPPING } from "./regional-shipping"
import { enqueue } from "./workflows/sub-orders"

const uid = (prefix: string) => `${prefix}_${randomUUID()}`

export async function checkout(request: Request, path: string[]) {
  // A request body can be read only once. Leave shipping-method requests
  // untouched for the shipping handler that owns them.
  if (!["payment-providers", "payment-collections"].includes(path[0]) &&
      !(path[0] === "carts" && path.length === 3 && path[2] === "complete")) return undefined
  const db = await database()
  if (path[0] === "payment-providers" && request.method === "GET") return { payment_providers: [{ id: "pp_system_default" }] }
  const actor = await cartActor(request)
  const input = request.method === "POST" ? await body(request) : {}
  if (path[0] === "payment-collections" && request.method === "POST") {
    const cartId = path.length === 1 ? text(input.cart_id, "cart_id") : null
    return transaction(async (db, session) => {
      const stored = cartId ? null : await db.collection("carts").findOne({ "payment_collection.id": path[1] }, { session })
      const cart = await ownedCart(db, cartId ?? stored?.id ?? "", actor, session)
      if (path.length !== 1 && (path.length !== 3 || path[2] !== "payment-sessions")) throw new ApiError(404, "Not found", "not_found")
      if (path.length === 3 && input.provider_id !== "pp_system_default") throw new ApiError(400, "Unsupported payment method")
      const amount = cartTotals(cart).total
      const payment = { id: cart.payment_collection?.id ?? uid("paycol"), currency_code: cart.currency_code,
        amount, status: "not_paid", payment_sessions: path.length === 3
          ? [{ id: uid("payses"), provider_id: "pp_system_default", amount, currency_code: cart.currency_code, status: "pending", data: {} }]
          : cart.payment_collection?.payment_sessions ?? [] }
      await db.collection("carts").updateOne({ id: cart.id }, { $set: { payment_collection: payment } }, { session })
      return { payment_collection: payment }
    })
  }
  if (path[0] !== "carts" || path.length !== 3 || path[2] !== "complete" || request.method !== "POST") return undefined
  const highest = await db.collection("orders").findOne({}, { sort: { display_id: -1 }, projection: { display_id: 1 } })
  await db.collection("counters").updateOne({ id: "order_display" }, { $max: { value: Number(highest?.display_id ?? 0) } }, { upsert: true })
  return transaction(async (db, session) => {
    const cart = await ownedCart(db, path[1], actor, session, true)
    if (cart.completed_at) {
      const order = await db.collection("orders").findOne({ cart_id: cart.id }, { session, projection: { _id: 0, migration_snapshot: 0 } })
      if (!order) throw new ApiError(409, "Incomplete order details")
      return { type: "order", order }
    }
    if (!cart.items?.length || cart.items.length > 100 || !cart.email || !cart.shipping_address?.address_1 || !cart.shipping_address?.phone) throw new ApiError(400, "Please complete your shipping information")
    if (cart.metadata?.payment_method !== "manual_bank") throw new ApiError(400, "Bank transfer is required. Please select bank transfer to continue.")
    const shippingMethod = cart.shipping_methods?.[0]
    const quote = shippingMethod?.quote_id && await db.collection("shipping_quotes").findOne({ id: shippingMethod.quote_id, cart_id: cart.id }, { session })
    if (!quote || +new Date(quote.expires_at) <= Date.now() || +new Date(quote.cart_updated_at) !== +new Date(cart.updated_at) || quote.amount !== shippingMethod.amount) throw new ApiError(409, "Your shipping quote has expired. Please select shipping again")
    if (quote.demo || quote.policy !== REGIONAL_SHIPPING.version) throw new ApiError(409, "Shipping rates have changed. Save your address again to recalculate")
    let regionalTotal = 0
    for (const parcel of quote.parcels) {
      const artisan = await db.collection("artisans").findOne({ id: parcel.artisan_id }, { session })
      const currentRate = regionalFee(artisan?.pickup_province_name, cart.shipping_address?.province)
      if (currentRate.fee !== parcel.fee || currentRate.region !== parcel.region) throw new ApiError(409, "The pickup province or shipping rates have changed. Please recalculate shipping")
      regionalTotal += currentRate.fee
    }
    if (regionalTotal !== shippingMethod.amount) throw new ApiError(409, "Shipping fee does not match the configured rates")
    if (!cart.payment_collection?.payment_sessions?.some((entry: Document) => entry.provider_id === "pp_system_default" && entry.status === "pending")) throw new ApiError(400, "Payment has not been initialized")
    const now = new Date()
    const counter = await db.collection("counters").findOneAndUpdate({ id: "order_display" }, { $inc: { value: 1 } }, { session, returnDocument: "after" })
    if (!counter) throw new ApiError(409, "Order counter has not been initialized")
    const orderId = uid("order"), marketplaceId = uid("mpo")
    const items: Document[] = []
    const customs = new Map<string, Document>()
    for (const original of cart.items) {
      const priced = await pricedLine(db, original.variant_id, original.quantity, cart.currency_code, session)
      let unitPrice = priced.unit_price
      const customId = original.metadata?.custom_request_id
      if (customId) {
        const custom = await db.collection("custom_requests").findOne({ id: customId, customer_id: actor?.id, status: "accepted", variant_id: original.variant_id }, { session })
        if (!custom || custom.quantity !== original.quantity || !Number.isSafeInteger(Number(custom.quoted_price))) throw new ApiError(409, "The custom quote is no longer valid")
        unitPrice = Number(custom.quoted_price); customs.set(customId, custom)
      }
      if (unitPrice !== original.unit_price) throw new ApiError(409, "The product price has changed. Please update your cart")
      const item = { ...priced, id: uid("ordli"), cart_line_item_id: original.id, metadata: original.metadata ?? {}, unit_price: unitPrice,
        total: unitPrice * original.quantity, subtotal: unitPrice * original.quantity }
      items.push(item)
      if (priced.variant?.manage_inventory && !priced.variant.allow_backorder && !customId) {
        const reserved = await db.collection("inventory").updateOne({ variant_id: item.variant_id,
          $expr: { $gte: [{ $subtract: ["$stock", "$reserved"] }, item.quantity] },
        }, { $inc: { reserved: item.quantity } }, { session })
        if (!reserved.modifiedCount) throw new ApiError(409, "This product has just sold out")
        await db.collection("reservations").insertOne({ id: uid("resitem"), line_item_id: item.id,
          variant_id: item.variant_id, quantity: item.quantity, created_at: now }, { session })
      }
    }
    const lineIds = quote.parcels.flatMap((parcel: Document) => parcel.line_item_ids)
    if (lineIds.length !== cart.items.length || new Set(lineIds).size !== lineIds.length || cart.items.some((item: Document) => !lineIds.includes(item.id))) throw new ApiError(409, "Shipping parcels do not match the cart")
    const total = cartTotals({ ...cart, items })
    const paymentMode = simulatedPaymentsEnabled() ? "simulation" : "bank"
    const order = { ...total, id: orderId, cart_id: cart.id, display_id: counter.value,
      status: "pending", created_at: now, updated_at: now, completed_at: null,
      metadata: { ...cart.metadata, payment_mode: paymentMode, is_simulated: paymentMode === "simulation" },
      payment_status: "awaiting", fulfillment_status: "not_fulfilled" }
    await db.collection("orders").insertOne(order, { session })
    await db.collection("marketplace_orders").insertOne({ id: marketplaceId, order_id: orderId,
      display_id: counter.value, customer_id: cart.customer_id, email: cart.email,
      currency_code: cart.currency_code, items_total: total.item_total,
      payment_method: "bank_transfer", payment_status: "awaiting_transfer", payment_mode: paymentMode,
      payment_deadline: new Date(+now + PAYMENT_WINDOW), created_at: now, updated_at: now,
    }, { session })
    for (let index = 0; index < quote.parcels.length; index++) {
      const parcel = quote.parcels[index]
      const parcelItems = items.filter((item) => parcel.line_item_ids.includes(item.cart_line_item_id))
      const custom = parcel.custom_request_id ? customs.get(parcel.custom_request_id) : null
      const madeToOrder = Boolean(custom) || parcelItems.some((item) => item.product.metadata?.fulfillment_type === "made_to_order")
      const leadDays = custom ? Number(custom.quoted_lead_days) : madeToOrder ? Math.max(...parcelItems.map((item) => Number(item.product.metadata?.lead_days ?? 0))) : null
      const sub = { id: uid("subo"), code: `#${counter.value}-${index + 1}`, marketplace_order_id: marketplaceId,
        payment_mode: paymentMode, artisan_id: parcel.artisan_id, is_custom: Boolean(custom), custom_request_id: custom?.id ?? null,
        made_to_order: madeToOrder, lead_days: leadDays,
        subtotal: parcelItems.reduce((sum, item) => sum + item.total, 0), shipping_charged: parcel.fee,
        shipping_name: [cart.shipping_address.last_name, cart.shipping_address.first_name].filter(Boolean).join(" "),
        shipping_phone: cart.shipping_address.phone, shipping_address: [cart.shipping_address.address_1, cart.shipping_address.city, cart.shipping_address.province].filter(Boolean).join(", "),
        items: parcelItems.map((item) => ({ id: uid("suboi"), line_item_id: item.id, product_id: item.product_id,
          variant_id: item.variant_id, title: item.title, variant_title: item.variant_title, thumbnail: item.thumbnail,
          quantity: item.quantity, unit_price: item.unit_price, total: item.total,
          made_to_order: Boolean(custom) || item.product.metadata?.fulfillment_type === "made_to_order" })),
        status: "pending_payment",
        refund_status: "not_required", payout_id: null, created_at: now, updated_at: now,
      }
      await db.collection("sub_orders").insertOne(sub, { session })
      if (custom) await db.collection("custom_requests").updateOne({ id: custom.id, status: "accepted" }, { $set: { status: "ordered", order_id: orderId } }, { session })
      await enqueue(db, session, `sub:${sub.id}:placed`, "sub_order_changed", { sub_order_id: sub.id, action: "placed" })
    }
    await db.collection("carts").updateOne({ id: cart.id, completed_at: null }, { $set: { completed_at: now } }, { session })
    await enqueue(db, session, `order:${orderId}:placed`, "order_placed", { order_id: orderId })
    return { type: "order", order }
  })
}
