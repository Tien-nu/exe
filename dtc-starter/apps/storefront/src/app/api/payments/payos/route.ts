import { verifyPayOSWebhook } from "../../../../server/payos"
import { ApiError, body, errorResponse, json } from "../../../../server/http"
import { transaction } from "../../../../server/mongodb"
import { changePaymentInTransaction } from "../../../../server/workflows/payments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    if (process.env.MONGODB_API_PREVIEW !== "true") throw new ApiError(404, "Not found", "not_found")
    const input = await body(request)
    let event: Awaited<ReturnType<typeof verifyPayOSWebhook>>
    try {
      event = await verifyPayOSWebhook(input)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(401, "Invalid PayOS webhook signature", "unauthorized")
    }

    const reference = typeof event.reference === "string" && event.reference ? event.reference : `link:${event.paymentLinkId}:${event.orderCode}`
    return json(await transaction(async (db, session) => {
      const key = `payos:${reference}`
      const previous = await db.collection("outbox").findOne({ deduplication_key: key }, { session })
      if (previous) return { success: true }

      const order = await db.collection("marketplace_orders").findOne({ payos_order_codes: event.orderCode }, { session })
      let result = "unmatched"
      if (!input.success || input.code !== "00" || event.code !== "00") result = "payment_not_successful"
      else if (!order) result = "unmatched_order"
      else if (order.payment_provider !== "payos") result = "wrong_payment_provider"
      else if (order.payos_order_code !== event.orderCode || order.payment_link_id !== event.paymentLinkId) result = "stale_payment_link"
      else if (event.currency !== "VND" || order.currency_code !== "vnd") result = "unsupported_currency"
      else if (order.payment_method !== "bank_transfer") result = "wrong_payment_method"
      else {
        const subs = await db.collection("sub_orders").find(
          { marketplace_order_id: order.id, status: { $ne: "canceled" } },
          { session }
        ).toArray()
        const amount = subs.reduce((sum, sub) => sum + Number(sub.subtotal) + Number(sub.shipping_charged ?? 0), 0)
        if (event.amount !== amount || event.amount !== Number(order.payment_link_amount) || amount <= 0) result = "amount_mismatch"
        else if (order.payment_status === "paid") result = "already_paid"
        else if (!["awaiting_transfer", "transfer_submitted"].includes(order.payment_status) || !order.payment_deadline || +new Date(order.payment_deadline) <= Date.now()) result = "late_payment"
        else {
          await changePaymentInTransaction(db, session, order.id, "confirm", { role: "system", id: `payos:${reference}` })
          await db.collection("marketplace_orders").updateOne(
            { id: order.id },
            { $set: { payment_provider: "payos", payment_transaction_id: reference, payos_order_code: event.orderCode } },
            { session }
          )
          result = "paid"
        }
      }

      await db.collection("outbox").insertOne({
        deduplication_key: key,
        type: "bank_receipt",
        status: "completed",
        created_at: new Date(),
        data: {
          provider: "payos",
          transaction_id: reference,
          payment_link_id: event.paymentLinkId,
          order_code: event.orderCode,
          amount: event.amount,
          currency: event.currency,
          order_id: order?.order_id ?? null,
          result,
          requires_review: Boolean(input.success && input.code === "00" && result !== "paid" && result !== "already_paid"),
        },
      }, { session })
      return { success: true }
    }))
  } catch (error) {
    return errorResponse(error)
  }
}
