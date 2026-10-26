import { timingSafeEqual } from "node:crypto"
import type { Document } from "mongodb"
import { authenticate } from "./auth"
import { database, transaction } from "./mongodb"
import { ApiError, body } from "./http"
import { cancelGhnOrder, createGhnOrder, previewGhnOrder, GHN_STATUS_LABELS, type GhnOrderInput, type GhnOrderResult } from "./ghn"
import { changeSubOrderInTransaction, enqueue, fullSubOrder } from "./workflows/sub-orders"

export function shipmentInput(sub: Document, marketplace: Document, order: Document, artisan: Document, products: Document[]): GhnOrderInput {
  if (order.shipping_methods?.some((method: Document) => method.data?.demo)) throw new ApiError(409, "Orders using sample addresses cannot create real shipments")
  if (sub.status !== "ready_to_ship") throw new ApiError(409, "This order is not ready for shipment")
  for (const key of ["shop_name", "phone", "pickup_address", "pickup_ward_name", "pickup_district_name", "pickup_province_name"]) {
    if (!artisan[key]) throw new ApiError(400, "The artisan profile has an incomplete pickup address")
  }
  const address = order.shipping_address
  const district = Number(order.metadata?.district_id), ward = String(order.metadata?.ward_code ?? "")
  if (!address?.phone || !Number.isSafeInteger(district) || district <= 0 || !ward) throw new ApiError(400, "This order has no GHN address; enter shipment details manually")
  return {
    client_order_code: `YARNLY${sub.code}${sub.ghn_attempt ? `-${sub.ghn_attempt}` : ""}`,
    from: { name: artisan.shop_name, phone: artisan.phone, address: artisan.pickup_address,
      ward_name: artisan.pickup_ward_name, district_name: artisan.pickup_district_name, province_name: artisan.pickup_province_name },
    to: { name: [address.last_name, address.first_name].filter(Boolean).join(" ") || "Customer", phone: address.phone,
      address: [address.address_1, address.city, address.province].filter(Boolean).join(", "), ward_code: ward, district_id: district },
    items: sub.items.map((item: Document) => ({ name: item.variant_title ? `${item.title} (${item.variant_title})` : item.title,
      quantity: item.quantity, price: Number(item.unit_price), weight: Number(products.find((product) => product.id === item.product_id)?.weight) || 200 })),
    cod_amount: marketplace.payment_method === "cod" ? Number(sub.subtotal) + Number(sub.shipping_charged ?? 0) : 0,
    receiver_pays_shipping: sub.shipping_charged == null, insurance_value: Number(sub.subtotal), content: `Yarnly order ${sub.code} – handmade crochet`,
  }
}

async function inputFor(id: string) {
  const db = await database()
  const sub = await db.collection("sub_orders").findOne({ id })
  if (!sub) throw new ApiError(404, "Order not found")
  const [marketplace, artisan, products] = await Promise.all([
    db.collection("marketplace_orders").findOne({ id: sub.marketplace_order_id }),
    db.collection("artisans").findOne({ id: sub.artisan_id }),
    db.collection("products").find({ id: { $in: sub.items.map((item: Document) => item.product_id) } }).toArray(),
  ])
  const order = marketplace && await db.collection("orders").findOne({ id: marketplace.order_id })
  if (!marketplace || !artisan || !order) throw new ApiError(409, "Missing shipment information")
  return shipmentInput(sub, marketplace, order, artisan, products)
}

// Pin the external request before calling GHN. Concurrent admin edits are blocked
// and retries reuse the same client_order_code, including after a lost response.
async function beginOperation(id: string, operation: "create" | "cancel", input?: GhnOrderInput) {
  return transaction(async (db, session) => {
    const { sub } = await fullSubOrder(db, session, id)
    if (sub.shipping_operation && sub.shipping_operation !== operation) throw new ApiError(409, "Shipment is being processed. Retry the previous action")
    if (operation === "create" && sub.status === "shipping" && sub.carrier === "GHN") return sub
    if (sub.status !== (operation === "create" ? "ready_to_ship" : "shipping") || operation === "cancel" && (sub.carrier !== "GHN" || !sub.tracking_number)) throw new ApiError(409, "Invalid shipment status")
    await db.collection("sub_orders").updateOne({ id }, { $set: { shipping_operation: operation, ...(operation === "create" && !sub.shipping_input ? { shipping_input: input } : {}) } }, { session })
    return sub
  })
}

async function backToReady(id: string, tracking: string) {
  return transaction(async (db, session) => {
    const { sub } = await fullSubOrder(db, session, id)
    if (sub.tracking_number !== tracking || sub.status !== "shipping") return
    await db.collection("sub_orders").updateOne({ id }, { $set: { status: "ready_to_ship", carrier: null, tracking_number: null,
      shipped_at: null, shipping_fee: null, expected_delivery_at: null, carrier_status: "cancel", updated_at: new Date() },
      $unset: { shipping_operation: "", shipping_input: "" }, $inc: { ghn_attempt: 1 } }, { session })
    await enqueue(db, session, `ghn:${tracking}:cancel`, "sub_order_changed", { sub_order_id: id, action: "ghn_cancel" })
  })
}

export async function ghnShipping(request: Request, path: string[]) {
  if (path[0] === "ghn" && path[1] === "webhook" && path.length === 2 && request.method === "POST") {
    const expected = process.env.GHN_WEBHOOK_TOKEN ?? "", supplied = new URL(request.url).searchParams.get("token") ?? ""
    const a = new TextEncoder().encode(expected), b = new TextEncoder().encode(supplied)
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, "Invalid webhook token")
    const payload = await body(request)
    if (typeof payload.OrderCode !== "string" || payload.OrderCode.length > 100 || typeof payload.Status !== "string" || !GHN_STATUS_LABELS[payload.Status]) throw new ApiError(400, "Invalid GHN callback")
    const db = await database()
    const sub = await db.collection("sub_orders").findOne({ carrier: "GHN", tracking_number: payload.OrderCode })
    if (!sub) return { success: true, handled: false }
    if (payload.Status === "cancel") await backToReady(sub.id, payload.OrderCode)
    else await transaction(async (db, session) => {
      const current = await db.collection("sub_orders").findOne({ id: sub.id, tracking_number: payload.OrderCode }, { session })
      if (!current || current.shipping_operation) throw new ApiError(409, "Shipment is being processed. Please try again")
      if (["canceled", "completed"].includes(current.status) || current.status === "delivered" && payload.Status !== "returned") return
      if (payload.Status === "delivered" && current.status === "shipping") await changeSubOrderInTransaction(db, session, sub.id, "deliver", { role: "admin", id: "ghn-webhook" })
      if (payload.Status === "returned" && ["shipping", "delivered"].includes(current.status)) await changeSubOrderInTransaction(db, session, sub.id, "cancel", { role: "system", id: "ghn-webhook" }, { reason: "GHN returned the parcel to the shop" })
      await db.collection("sub_orders").updateOne({ id: sub.id }, { $set: { carrier_status: payload.Status, updated_at: new Date() } }, { session })
    })
    return { success: true, handled: true }
  }
  if (path[0] !== "admin" || path[1] !== "marketplace" || path[2] !== "sub-orders" || path.length !== 5 || !["ghn", "ghn-quote", "ghn-cancel"].includes(path[4]) || request.method !== "POST") return undefined
  const actor = await authenticate(request, "admin"), id = path[3]
  if (path[4] === "ghn-quote") {
    const input = await inputFor(id), quote = await previewGhnOrder(input)
    return { quote: { ...quote, cod_amount: input.cod_amount, from: input.from, to: input.to } }
  }
  if (path[4] === "ghn-cancel") {
    const sub = await beginOperation(id, "cancel")
    await cancelGhnOrder(sub.tracking_number)
    await backToReady(id, sub.tracking_number)
    return { success: true }
  }
  // Validate before pinning the operation so invalid addresses never lock orders.
  const db = await database()
  const current = await db.collection("sub_orders").findOne({ id })
  if (current?.status === "shipping" && current.carrier === "GHN") return { order_code: current.tracking_number, total_fee: current.shipping_fee }
  const input = await inputFor(id)
  await beginOperation(id, "create", input)
  const pinned = await db.collection("sub_orders").findOne({ id })
  let created: GhnOrderResult
  try { created = await createGhnOrder(pinned!.shipping_input) }
  catch (error) {
    // A definitive 4xx rejection creates no shipment. Network/5xx outcomes
    // retain the pinned payload so an uncertain booking can be retried safely.
    if (error instanceof ApiError && error.type === "ghn_rejected") await db.collection("sub_orders").updateOne({ id, status: "ready_to_ship", shipping_operation: "create" }, { $unset: { shipping_operation: "", shipping_input: "" } })
    throw error
  }
  if (!created.order_code || !Number.isSafeInteger(created.total_fee) || created.total_fee < 0) throw new ApiError(502, "GHN returned invalid data. Retry to reconcile")
  await transaction(async (db, session) => {
    const { sub } = await fullSubOrder(db, session, id)
    if (sub.status === "shipping" && sub.tracking_number === created.order_code) return
    await changeSubOrderInTransaction(db, session, id, "ship", { role: "admin", id: actor.id! }, { carrier: "GHN", tracking_number: created.order_code, shipping_operation: "create" })
    await db.collection("sub_orders").updateOne({ id }, { $set: { shipping_fee: created.total_fee, expected_delivery_at: created.expected_delivery_time ? new Date(created.expected_delivery_time) : null,
      carrier_status: "ready_to_pick" }, $unset: { shipping_operation: "" } }, { session })
  })
  return created
}
