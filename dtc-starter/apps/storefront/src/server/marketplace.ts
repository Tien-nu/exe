import type { Document } from "mongodb"
import { authenticate } from "./auth"
import { database } from "./mongodb"
import { ApiError, body, pagination, text } from "./http"
import { marketplaceOrderForCustomer, subOrderForArtisan } from "./marketplace-view"
import { changeSubOrder } from "./workflows/sub-orders"
import { changePayment } from "./workflows/payments"
import { generatePayouts, markPayoutPaid } from "./workflows/payouts"

async function withArtisans(collection: string, filter: Document, limit: number, offset = 0) {
  const db = await database()
  return db.collection(collection).aggregate([
    { $match: filter }, { $sort: { created_at: -1, id: 1 } }, { $skip: offset }, { $limit: limit },
    { $lookup: { from: "artisans", localField: "artisan_id", foreignField: "id", as: "artisan" } },
    { $unwind: { path: "$artisan", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, "artisan._id": 0 } },
  ]).toArray()
}

async function orderView(filter: Document, limit: number, offset: number) {
  const db = await database()
  return db.collection("marketplace_orders").aggregate([
    { $match: filter }, { $sort: { created_at: -1, id: 1 } }, { $skip: offset }, { $limit: limit },
    { $lookup: { from: "sub_orders", localField: "id", foreignField: "marketplace_order_id", as: "sub_orders",
      pipeline: [
        { $lookup: { from: "artisans", localField: "artisan_id", foreignField: "id", as: "artisan" } },
        { $unwind: { path: "$artisan", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, "artisan._id": 0 } },
      ],
    } }, { $project: { _id: 0 } },
  ]).toArray()
}

export async function marketplace(request: Request, path: string[]) {
  const url = new URL(request.url)
  const method = request.method
  const db = await database()
  const { limit, offset } = pagination(url)
  if (path[0] === "store" && path[1] === "marketplace") {
    const actor = await authenticate(request, "customer")
    if (path[2] === "orders") {
      if (path.length === 5 && path[4] === "transfer-submitted" && method === "POST") {
        throw new ApiError(403, "Payment is confirmed only after bank verification")
      }
      if (method !== "GET" || path.length > 4) throw new ApiError(405, "Method not allowed")
      const rows = await orderView({ customer_id: actor.id, ...(path[3] ? { order_id: path[3] } : {}) }, limit, offset)
      const settings = await db.collection("marketplace_settings").findOne({})
      if (path[3]) {
        if (!rows[0]) throw new ApiError(404, "Order not found", "not_found")
        return { order: marketplaceOrderForCustomer(rows[0], settings) }
      }
      return { orders: rows.map((row) => marketplaceOrderForCustomer(row, settings)) }
    }
    if (path[2] === "sub-orders" && path[3] && path[4] === "cancel" && path.length === 5 && method === "POST") {
      return changeSubOrder(path[3], "cancel", { role: "customer", id: actor.id! })
    }
    return undefined
  }
  if (path[0] === "artisan" && ["sub-orders", "payouts", "dashboard"].includes(path[1])) {
    const actor = await authenticate(request, "artisan")
    const artisan = await db.collection("artisans").findOne({ id: actor.id })
    if (!artisan || artisan.status !== "active") throw new ApiError(403, "Your artisan account has not been approved or is locked", "not_allowed")
    const actorFilter = { artisan_id: actor.id }
    if (path[1] === "payouts" && method === "GET" && path.length === 2) {
      return { payouts: await db.collection("payouts").find(actorFilter, { projection: { _id: 0 } }).sort({ created_at: -1 }).skip(offset).limit(limit).toArray() }
    }
    if (path[1] === "dashboard" && method === "GET" && path.length === 2) {
      const [counts, pendingRequests, revenue, payouts] = await Promise.all([
        db.collection("sub_orders").aggregate([{ $match: actorFilter }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
        db.collection("custom_requests").countDocuments({ ...actorFilter, status: "pending" }),
        db.collection("sub_orders").aggregate([{ $match: { ...actorFilter, status: "completed" } }, { $group: {
          _id: null, completed_total: { $sum: "$subtotal" }, awaiting_payout: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$payout_id", null] }, null] }, "$subtotal", 0] } },
        } }]).toArray(),
        db.collection("payouts").aggregate([{ $match: actorFilter }, { $group: { _id: "$status", total: { $sum: "$net_amount" } } }]).toArray(),
      ])
      return { sub_orders_by_status: Object.fromEntries(counts.map((row) => [row._id, row.count])), pending_custom_requests: pendingRequests,
        revenue: { completed_total: revenue[0]?.completed_total ?? 0, awaiting_payout: revenue[0]?.awaiting_payout ?? 0,
          pending_payout: payouts.find((row) => row._id === "pending")?.total ?? 0, paid_out: payouts.find((row) => row._id === "paid")?.total ?? 0 } }
    }
    if (path[1] === "sub-orders") {
      if (method === "POST" && path.length === 4 && ["accept", "decline", "ready"].includes(path[3])) {
        const input = path[3] === "decline" ? await body(request) : {}
        return changeSubOrder(path[2], path[3], { role: "artisan", id: actor.id! }, input)
      }
      if (method === "GET" && path.length <= 3) {
        const filter: Document = { ...actorFilter,
          $nor: [{ status: "pending_payment" }, { status: "canceled", accept_deadline: null, accepted_at: null }],
        }
        if (path[2]) filter.id = path[2]
        if (url.searchParams.has("status")) filter.status = url.searchParams.get("status")
        if (["true", "false"].includes(url.searchParams.get("custom") ?? "")) filter.is_custom = url.searchParams.get("custom") === "true"
        const rows = await db.collection("sub_orders").aggregate([
          { $match: filter }, { $sort: { created_at: -1, id: 1 } }, { $skip: offset }, { $limit: limit },
          { $lookup: { from: "marketplace_orders", localField: "marketplace_order_id", foreignField: "id", as: "marketplace_order" } },
          { $unwind: "$marketplace_order" },
          { $lookup: { from: "custom_requests", localField: "custom_request_id", foreignField: "id", as: "custom_request" } },
        ]).toArray()
        const views = rows.map((row) => subOrderForArtisan(row, row.custom_request[0]))
        if (path[2]) {
          if (!views[0]) throw new ApiError(404, "Order not found", "not_found")
          return { sub_order: views[0] }
        }
        return { sub_orders: views }
      }
    }
    throw new ApiError(405, "Method not allowed")
  }
  if (path[0] === "admin" && path[1] === "marketplace") {
    const actor = await authenticate(request, "admin")
    const [resource, id, action] = path.slice(2)
    if (resource === "orders") {
      if (method === "GET" && path.length === 3) {
        const paymentStatuses = url.searchParams.getAll("payment_status")
        const filter = paymentStatuses.length ? { payment_status: { $in: paymentStatuses } } : {}
        return { orders: await orderView(filter, limit, offset) }
      }
      if (method === "POST" && id && path.length === 5 && ["confirm-payment", "reject-payment"].includes(action)) {
        const input = action === "reject-payment" ? await body(request) : {}
        return changePayment(id, action === "confirm-payment" ? "confirm" : "reject", { role: "admin", id: actor.id! }, typeof input.reason === "string" ? input.reason : undefined)
      }
    }
    if (resource === "sub-orders") {
      if (method === "GET" && path.length === 3) {
        const filter: Document = {}
        for (const field of ["status", "refund_status"]) if (url.searchParams.has(field)) filter[field] = url.searchParams.get(field)
        const rows = await withArtisans("sub_orders", filter, limit, offset)
        const orders = await db.collection("marketplace_orders").find({ id: { $in: rows.map((row) => row.marketplace_order_id) } }, { projection: { _id: 0 } }).toArray()
        return { sub_orders: rows.map((row) => ({ ...row, marketplace_order: orders.find((order) => order.id === row.marketplace_order_id) })) }
      }
      if (method === "POST" && id && path.length === 5 && ["ship", "deliver", "cancel", "refunded"].includes(action)) {
        return changeSubOrder(id, action, { role: "admin", id: actor.id! }, ["ship", "cancel"].includes(action) ? await body(request) : {})
      }
    }
    if (resource === "payouts") {
      if (method === "GET" && path.length === 3) return { payouts: await withArtisans("payouts", {}, limit, offset) }
      if (method === "POST" && path.length === 3) return { created: (await generatePayouts()).length }
      if (method === "POST" && id && action === "paid" && path.length === 5) {
        return markPayoutPaid(id, text((await body(request)).transaction_ref, "transaction_ref", 500))
      }
    }
    return undefined
  }
  return undefined
}
