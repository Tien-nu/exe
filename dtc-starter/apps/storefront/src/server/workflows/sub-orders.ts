import type { ClientSession, Db, Document } from "mongodb"
import { transaction } from "../mongodb"
import { ApiError } from "../http"
import { transition, type Role, type SubOrder } from "../domain/order-rules"

export type WorkflowActor = { role: Role; id: string }
type StoredSubOrder = Document & SubOrder & { id: string; marketplace_order_id: string; items: Document[] }

export async function enqueue(db: Db, session: ClientSession, key: string, type: string, data: Document) {
  await db.collection("outbox").updateOne({ deduplication_key: key }, { $setOnInsert: {
    deduplication_key: key, type, data, status: "pending", attempts: 0,
    created_at: new Date(), next_attempt_at: new Date(),
  } }, { upsert: true, session })
}

export async function fullSubOrder(db: Db, session: ClientSession, id: string) {
  const sub = await db.collection<StoredSubOrder>("sub_orders").findOne({ id }, { session })
  if (!sub) throw new ApiError(404, "Order not found", "not_found")
  const order = await db.collection("marketplace_orders").findOne({ id: sub.marketplace_order_id }, { session })
  if (!order) throw new ApiError(409, "Incomplete order details")
  return { sub: { ...sub, customer_id: order.customer_id } as StoredSubOrder, order }
}

async function settleReservations(db: Db, session: ClientSession, sub: StoredSubOrder, consume: boolean) {
  for (const item of sub.items ?? []) {
    const reservation = await db.collection("reservations").findOneAndDelete({ line_item_id: item.line_item_id }, { session })
    if (!reservation) continue
    const quantity = Number(reservation.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiError(409, "Invalid inventory data")
    const result = await db.collection("inventory").updateOne({ variant_id: reservation.variant_id,
      reserved: { $gte: quantity }, ...(consume && !item.made_to_order ? { stock: { $gte: quantity } } : {}),
    }, { $inc: { reserved: -quantity, ...(consume && !item.made_to_order ? { stock: -quantity } : {}) } }, { session })
    if (!result.modifiedCount) throw new ApiError(409, "Stock does not match reservations")
  }
}

export async function changeSubOrderInTransaction(db: Db, session: ClientSession, id: string,
  action: string, actor: WorkflowActor, input: Record<string, unknown> = {}, now = new Date()) {
  const { sub, order } = await fullSubOrder(db, session, id)
  if (actor.role === "system" && input.expected_status && sub.status !== input.expected_status) throw new ApiError(409, "The order status has changed")
  if (sub.shipping_operation && input.shipping_operation !== sub.shipping_operation) throw new ApiError(409, "A GHN shipment is being processed. Complete that action first")
  let update: Document
  if (action === "refunded") {
    if (actor.role !== "admin" || sub.refund_status !== "pending") throw new ApiError(409, "This order has no pending refund")
    update = { refund_status: "refunded", refunded_at: now }
  } else {
    try { update = transition(sub, action, actor, now) }
    catch (error) {
      if ((error as Error).message === "not_found") throw new ApiError(404, "Order not found", "not_found")
      throw new ApiError(409, (error as Error).message === "deadline_passed" ? "The order acceptance deadline has passed" : "This action is unavailable in the current status", "not_allowed")
    }
  }
  if (sub.admin_fulfillment_active && ["cancel", "decline", "ship"].includes(action))
    throw new ApiError(409, "Manage this order's active fulfillment in Admin Orders before changing shipment or cancellation")
  if (["cancel", "decline"].includes(action)) {
    const reason = actor.role === "customer" ? "Customer canceled the order" : input.reason
    if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) throw new ApiError(400, "Please enter a reason")
    update.cancel_reason = actor.role === "artisan" ? `Artisan declined: ${reason.trim()}` : reason.trim()
    update.refund_status = order.payment_method === "bank_transfer" && ["paid", "transfer_submitted"].includes(order.payment_status) ? "pending" : "not_required"
    await settleReservations(db, session, sub, false)
  }
  if (action === "ship") {
    for (const field of ["carrier", "tracking_number"]) {
      if (typeof input[field] !== "string" || !input[field].trim() || input[field].length > 200) throw new ApiError(400, `Invalid ${field}`)
      update[field] = input[field].trim()
    }
    await settleReservations(db, session, sub, true)
  }
  const changed = await db.collection("sub_orders").updateOne({ id, status: sub.status,
    ...(action === "refunded" ? { refund_status: "pending" } : {}),
  }, { $set: { ...update, updated_at: now } }, { session })
  if (!changed.modifiedCount) throw new ApiError(409, "The order was updated. Please reload")
  if (update.status === "canceled") {
    const active = await db.collection("sub_orders").countDocuments({ marketplace_order_id: order.id, status: { $ne: "canceled" } }, { session })
    if (!active) await db.collection("orders").updateOne({ id: order.order_id }, { $set: { status: "canceled", canceled_at: now } }, { session })
  }
  await enqueue(db, session, `sub:${id}:${action}`, "sub_order_changed", { sub_order_id: id, action })
  return { success: true }
}

export async function changeSubOrder(id: string, action: string, actor: WorkflowActor, input: Record<string, unknown> = {}) {
  return transaction((db, session) => changeSubOrderInTransaction(db, session, id, action, actor, input))
}
