import { database } from "./mongodb"
import { changePayment } from "./workflows/payments"
import { changeSubOrder } from "./workflows/sub-orders"
import { ApiError } from "./http"

export async function runTimers() {
  const db = await database(), now = new Date(), deadline = Date.now() + 25_000
  const results = { expired_payments: 0, canceled_acceptances: 0, completed_orders: 0, conflicts: 0 }
  const [orders, pending, delivered] = await Promise.all([
    db.collection("marketplace_orders").find({ payment_status: "awaiting_transfer", payment_deadline: { $lt: now } }, { projection: { id: 1 } }).limit(100).toArray(),
    db.collection("sub_orders").find({ status: "pending_acceptance", accept_deadline: { $lt: now } }, { projection: { id: 1 } }).limit(100).toArray(),
    db.collection("sub_orders").find({ status: "delivered", complete_at: { $lt: now } }, { projection: { id: 1 } }).limit(100).toArray(),
  ])
  for (const order of orders) {
    if (Date.now() >= deadline) return results
    try { await changePayment(order.id, "expire", { role: "system", id: "timer" }); results.expired_payments++ }
    catch (error) { if (error instanceof ApiError && error.status === 409) results.conflicts++; else throw error }
  }
  for (const sub of pending) {
    if (Date.now() >= deadline) return results
    try { await changeSubOrder(sub.id, "cancel", { role: "system", id: "timer" }, { expected_status: "pending_acceptance", reason: "The artisan did not confirm within 12 hours" }); results.canceled_acceptances++ }
    catch (error) { if (error instanceof ApiError && error.status === 409) results.conflicts++; else throw error }
  }
  for (const sub of delivered) {
    if (Date.now() >= deadline) return results
    try { await changeSubOrder(sub.id, "complete", { role: "system", id: "timer" }); results.completed_orders++ }
    catch (error) { if (error instanceof ApiError && error.status === 409) results.conflicts++; else throw error }
  }
  return results
}
