import { randomUUID } from "node:crypto"
import { authenticate } from "../../../../../server/auth"
import { database } from "../../../../../server/mongodb"
import { ApiError, body, errorResponse, json, text } from "../../../../../server/http"
import { payOSClient } from "../../../../../server/payos"
import { getAuthHeaders } from "../../../../../lib/data/cookies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function amountToPay(db: Awaited<ReturnType<typeof database>>, orderId: string) {
  const subs = await db.collection("sub_orders").find({
    marketplace_order_id: orderId,
    status: { $ne: "canceled" },
  }).toArray()
  return subs.reduce((sum, sub) => sum + Number(sub.subtotal) + Number(sub.shipping_charged ?? 0), 0)
}

function orderPage(baseUrl: string, orderId: string, result: "return" | "cancel") {
  const configured = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_BASE_URL || baseUrl
  const base = new URL(configured)
  const localePrefix = base.pathname.replace(/\/+$/, "") || "/vn"
  const page = new URL(`${localePrefix}/account/orders/details/${encodeURIComponent(orderId)}`, base.origin)
  page.searchParams.set("payment", result)
  return page.toString()
}

export async function POST(request: Request) {
  let lock: { orderId: string; lockId: string } | null = null
  try {
    if (process.env.MONGODB_API_PREVIEW !== "true") throw new ApiError(404, "Not found", "not_found")
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "Invalid origin")

    const authRequest = new Request(request.url, { headers: await getAuthHeaders() })
    const actor = await authenticate(authRequest, "customer")
    if (!actor.id) throw new ApiError(401, "Unauthorized", "unauthorized")
    const input = await body(request)
    const orderId = text(input.order_id, "order_id")
    const db = await database()
    const order = await db.collection("marketplace_orders").findOne({ order_id: orderId, customer_id: actor.id })
    if (!order) throw new ApiError(404, "Order not found", "not_found")
    if (order.payment_provider !== "payos" || order.payment_method !== "bank_transfer" || order.currency_code !== "vnd") {
      throw new ApiError(409, "This order is not configured for PayOS")
    }
    if (order.payment_status !== "awaiting_transfer" || !order.payment_deadline || +new Date(order.payment_deadline) <= Date.now()) {
      throw new ApiError(409, "This order is no longer waiting for payment")
    }
    const amount = await amountToPay(db, order.id)
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(409, "The order has no payable balance")
    if (order.payment_url && order.payment_link_id && Number(order.payment_link_amount) === amount) {
      return json({ checkout_url: order.payment_url })
    }

    const payOS = payOSClient()
    const now = new Date()
    const lockId = randomUUID()
    const claim = await db.collection("marketplace_orders").findOneAndUpdate(
      { id: order.id, payment_status: "awaiting_transfer", $or: [
        { payment_link_lock_until: { $exists: false } },
        { payment_link_lock_until: { $lte: now } },
      ] },
      { $set: { payment_link_lock_id: lockId, payment_link_lock_until: new Date(+now + 90_000) } },
      { returnDocument: "after" }
    )
    if (!claim) {
      const latest = await db.collection("marketplace_orders").findOne({ id: order.id })
      if (latest?.payment_url && Number(latest.payment_link_amount) === amount) return json({ checkout_url: latest.payment_url })
      throw new ApiError(409, "A PayOS link is being prepared. Please retry in a moment")
    }
    lock = { orderId: order.id, lockId }

    if (claim.payment_link_id && Number(claim.payment_link_amount) !== amount) {
      try {
        await payOS.paymentRequests.cancel(String(claim.payment_link_id), "Order total changed")
      } catch {
        const existing = await payOS.paymentRequests.get(String(claim.payment_link_id))
        if (existing.status === "PAID") throw new ApiError(409, "PayOS has already received the previous order total. Please contact Yarnly support")
        if (!["CANCELLED", "EXPIRED"].includes(existing.status)) {
          throw new ApiError(503, "The old PayOS link could not be replaced. Please retry")
        }
      }
    }

    await db.collection("counters").updateOne(
      { id: "payos_order_code" },
      { $max: { value: Date.now() } },
      { upsert: true }
    )
    const counter = await db.collection("counters").findOneAndUpdate(
      { id: "payos_order_code" },
      { $inc: { value: 1 } },
      { returnDocument: "after" }
    )
    const orderCode = Number(counter?.value)
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) throw new ApiError(503, "Could not create a PayOS order code")
    await db.collection("marketplace_orders").updateOne(
      { id: order.id, payment_link_lock_id: lockId },
      { $addToSet: { payos_order_codes: orderCode }, $set: { payos_pending_order_code: orderCode } }
    )

    const deadline = new Date(order.payment_deadline)
    const baseUrl = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const link = await payOS.paymentRequests.create({
      orderCode,
      amount,
      description: "YARNLY",
      returnUrl: orderPage(baseUrl, order.order_id, "return"),
      cancelUrl: orderPage(baseUrl, order.order_id, "cancel"),
      expiredAt: Math.floor(+deadline / 1000),
    })

    const currentAmount = await amountToPay(db, order.id)
    if (currentAmount !== amount) {
      await payOS.paymentRequests.cancel(link.paymentLinkId, "Order total changed")
      throw new ApiError(409, "The order changed while the PayOS link was created. Please retry")
    }
    const saved = await db.collection("marketplace_orders").updateOne(
      { id: order.id, payment_status: "awaiting_transfer", payment_link_lock_id: lockId },
      { $set: {
        payment_link_id: link.paymentLinkId,
        payment_url: link.checkoutUrl,
        payment_link_amount: amount,
        payos_order_code: orderCode,
        updated_at: new Date(),
      }, $unset: { payos_pending_order_code: "", payment_link_lock_id: "", payment_link_lock_until: "" } }
    )
    lock = null
    if (!saved.modifiedCount) {
      await payOS.paymentRequests.cancel(link.paymentLinkId, "Order is no longer payable")
      throw new ApiError(409, "This order is no longer waiting for payment")
    }
    return json({ checkout_url: link.checkoutUrl })
  } catch (error) {
    if (lock) {
      const db = await database().catch(() => null)
      await db?.collection("marketplace_orders").updateOne(
        { id: lock.orderId, payment_link_lock_id: lock.lockId },
        { $unset: { payment_link_lock_id: "", payment_link_lock_until: "", payos_pending_order_code: "" } }
      ).catch(() => {})
    }
    return errorResponse(error)
  }
}
