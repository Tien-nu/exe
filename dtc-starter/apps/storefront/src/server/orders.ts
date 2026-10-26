import { randomBytes, createHash } from "node:crypto"
import type { Document } from "mongodb"
import { authenticate } from "./auth"
import { database, transaction } from "./mongodb"
import { ApiError, body, pagination, text } from "./http"
import { enqueue } from "./workflows/sub-orders"
import { rateLimit } from "./rate-limit"

function view(order: Document) {
  const { _id, migration_snapshot, legacy_totals, ...result } = order
  return { ...result, payment_collections: order.payment_collection ? [order.payment_collection] : [],
    summary: legacy_totals ?? { current_order_total: order.total } }
}

export async function orders(request: Request, path: string[]) {
  if (path[0] !== "orders") return undefined
  const db = await database()
  const id = path[1]
  if (request.method === "GET") {
    const actor = request.headers.has("authorization") ? await authenticate(request, "customer") : null
    if (!id) {
      if (!actor?.id) throw new ApiError(401, "Unauthorized", "unauthorized")
      const { limit, offset } = pagination(new URL(request.url))
      const filter = { customer_id: actor.id, deleted_at: null }
      const rows = await db.collection("orders").find(filter).sort({ created_at: -1 }).skip(offset).limit(limit).toArray()
      return { orders: rows.map(view), count: await db.collection("orders").countDocuments(filter), limit, offset }
    }
    if (path.length !== 2) throw new ApiError(404, "Not found", "not_found")
    const order = await db.collection("orders").findOne({ id, deleted_at: null })
    // Guest order IDs are unguessable capabilities, as in the old storefront.
    // Registered orders additionally require their owner to authenticate.
    if (!order || order.customer_id && order.customer_id !== actor?.id) throw new ApiError(404, "Order not found", "not_found")
    return { order: view(order) }
  }
  if (request.method !== "POST" || !id) throw new ApiError(405, "Method not allowed")
  const input = await body(request)
  if (path[2] !== "transfer") throw new ApiError(404, "Not found", "not_found")
  if (path.length === 4 && path[3] === "request") {
    const actor = await authenticate(request, "customer")
    await rateLimit(`order-transfer:${id}`, 3, 60 * 60_000)
    const code = randomBytes(32).toString("base64url")
    const hash = createHash("sha256").update(code).digest("hex")
    return transaction(async (db, session) => {
      const order = await db.collection("orders").findOne({ id, deleted_at: null }, { session })
      if (!order) throw new ApiError(404, "Order not found", "not_found")
      if (order.customer_id === actor.id) throw new ApiError(409, "This order already belongs to this account")
      await db.collection("order_transfers").updateOne({ order_id: id }, { $set: { token_hash: hash, customer_id: actor.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60_000), created_at: new Date() } }, { session, upsert: true })
      await enqueue(db, session, `transfer:${id}:${hash}`, "order_transfer_requested", { order_id: id, code, to: order.email })
      return { order: { id, email: order.email } }
    })
  }
  if (path.length === 4 && ["accept", "decline"].includes(path[3])) {
    const hash = createHash("sha256").update(text(input.token, "token", 200)).digest("hex")
    return transaction(async (db, session) => {
      const transfer = await db.collection("order_transfers").findOneAndDelete({ order_id: id, token_hash: hash,
        expires_at: { $gt: new Date() } }, { session })
      if (!transfer) throw new ApiError(400, "The order transfer link is invalid or expired")
      if (path[3] === "accept") {
        await db.collection("orders").updateOne({ id }, { $set: { customer_id: transfer.customer_id } }, { session })
        await db.collection("marketplace_orders").updateOne({ order_id: id }, { $set: { customer_id: transfer.customer_id } }, { session })
      }
      const order = await db.collection("orders").findOne({ id }, { session })
      if (!order) throw new ApiError(404, "Order not found", "not_found")
      return { order: view(order) }
    })
  }
  throw new ApiError(404, "Not found", "not_found")
}
