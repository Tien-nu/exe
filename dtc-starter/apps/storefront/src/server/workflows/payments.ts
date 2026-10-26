import type { Db, ClientSession } from "mongodb"
import { transaction } from "../mongodb"
import { ApiError } from "../http"
import { startState } from "../domain/order-rules"
import {
  enqueue,
  changeSubOrderInTransaction,
  type WorkflowActor,
} from "./sub-orders"

// All payment and sub-order changes commit together. Retried transactions
// cannot leave paid orders with pending-payment sub-orders or duplicate mail.
export async function changePayment(
  id: string,
  action: "confirm" | "reject" | "expire",
  actor: WorkflowActor,
  reason?: string
) {
  if (action === "expire" ? actor.role !== "system" : actor.role !== "admin") {
    throw new ApiError(403, "Not allowed", "not_allowed")
  }
  return transaction((db, session) =>
    changePaymentInTransaction(db, session, id, action, actor, reason)
  )
}

export async function changePaymentInTransaction(
  db: Db,
  session: ClientSession,
  id: string,
  action: "confirm" | "reject" | "expire",
  actor: WorkflowActor,
  reason?: string
) {
  if (!["admin", "system"].includes(actor.role))
    throw new ApiError(403, "Not allowed")
  const order = await db
    .collection("marketplace_orders")
    .findOne({ id }, { session })
  if (!order) throw new ApiError(404, "Order not found", "not_found")
  if (
    !["awaiting_transfer", "transfer_submitted"].includes(order.payment_status)
  ) {
    throw new ApiError(
      409,
      "This order is not awaiting transfer confirmation",
      "not_allowed"
    )
  }
  const now = new Date()
  if (
    action === "expire" &&
    (order.payment_status !== "awaiting_transfer" ||
      !order.payment_deadline ||
      +new Date(order.payment_deadline) >= +now)
  ) {
    throw new ApiError(409, "This order has not expired")
  }
  const status =
    action === "confirm" ? "paid" : action === "reject" ? "rejected" : "expired"
  await db.collection("marketplace_orders").updateOne(
    { id: order.id, payment_status: order.payment_status },
    {
      $set: {
        payment_status: status,
        ...(action === "confirm" ? { paid_at: now } : {}),
        updated_at: now,
      },
    },
    { session }
  )
  if (action === "confirm") {
    const native = await db
      .collection("orders")
      .findOne({ id: order.order_id }, { session })
    if (!native) throw new ApiError(409, "Incomplete order details")
    const collection = {
      ...native.payment_collection,
      amount: native.total,
      status: "completed",
      captured_amount: native.total,
      completed_at: now,
    }
    await db.collection("orders").updateOne(
      { id: order.order_id },
      {
        $set: {
          payment_status: "captured",
          payment_collection: collection,
          ...(native.payment_collections
            ? {
                payment_collections: native.payment_collections.map(
                  (entry: Record<string, unknown>) => ({
                    ...entry,
                    status: "completed",
                    captured_amount: entry.amount,
                    completed_at: now,
                  })
                ),
              }
            : {}),
          payment_verified_by: actor.id,
          updated_at: now,
        },
      },
      { session }
    )
  }
  const waiting = await db
    .collection("sub_orders")
    .find(
      { marketplace_order_id: order.id, status: "pending_payment" },
      { session }
    )
    .toArray()
  for (const sub of waiting) {
    if (action === "confirm") {
      const state = startState(
        { is_custom: sub.is_custom, lead_days: sub.lead_days },
        now
      )
      await db
        .collection("sub_orders")
        .updateOne(
          { id: sub.id, status: "pending_payment" },
          { $set: { ...state, updated_at: now } },
          { session }
        )
      if (actor.id !== "simulation-qr")
        await enqueue(db, session, `sub:${sub.id}:paid`, "sub_order_changed", {
          sub_order_id: sub.id,
          action: "paid",
        })
    } else
      await changeSubOrderInTransaction(
        db,
        session,
        sub.id,
        "cancel",
        { role: actor.role === "system" ? "system" : "admin", id: actor.id },
        {
          reason:
            reason ||
            (action === "expire"
              ? "Bank transfer was not received within 10 minutes"
              : "Yarnly did not receive the bank transfer"),
        },
        now
      )
  }
  if (actor.id !== "simulation-qr")
    await enqueue(
      db,
      session,
      `payment:${order.id}:${status}`,
      "payment_changed",
      { marketplace_order_id: order.id, action }
    )
  return { success: true }
}
