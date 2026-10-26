import { randomUUID } from "node:crypto"
import type { Document } from "mongodb"
import { authenticate } from "./auth"
import { artisanFor, validate } from "./artisans"
import { database, transaction } from "./mongodb"
import { ApiError, body, pagination } from "./http"
import { CreateCustomRequestSchema, RespondCustomRequestSchema, DecideCustomRequestSchema } from "./validators"
import { customRequestForArtisan, customRequestForCustomer } from "./marketplace-view"
import { ownedCart, pricedLine } from "./carts"
import { enqueue } from "./workflows/sub-orders"

export async function customRequests(request: Request, path: string[]) {
  const isCustomer = path[0] === "store" && path[1] === "marketplace" && path[2] === "custom-requests"
  const isArtisan = path[0] === "artisan" && path[1] === "custom-requests"
  if (!isCustomer && !isArtisan) return undefined
  const db = await database()
  const actor = isCustomer ? await authenticate(request, "customer") : null
  const artisan = isArtisan ? await artisanFor(request) : null
  const resourcePath = isCustomer ? path.slice(2) : path.slice(1)
  const owner = isCustomer ? { customer_id: actor!.id } : { artisan_id: artisan!.id }
  if (request.method === "GET" && resourcePath.length === 1) {
    const url = new URL(request.url), { limit, offset } = pagination(url)
    const filter: Document = { ...owner }
    if (url.searchParams.has("status")) filter.status = url.searchParams.get("status")
    const rows = await db.collection("custom_requests").aggregate([
      { $match: filter }, { $sort: { created_at: -1, id: 1 } }, { $skip: offset }, { $limit: limit },
      { $lookup: { from: "artisans", localField: "artisan_id", foreignField: "id", as: "artisan" } }, { $unwind: "$artisan" },
    ]).toArray()
    return { custom_requests: isCustomer ? rows.map(customRequestForCustomer) : rows.map(customRequestForArtisan) }
  }
  if (request.method !== "POST") throw new ApiError(405, "Method not allowed")
  const raw = await body(request)
  if (isCustomer && resourcePath.length === 1) {
    const input = validate(CreateCustomRequestSchema, raw)
    return transaction(async (db, session) => {
      const product = await db.collection("products").findOne({ id: input.product_id, status: "published", deleted_at: null }, { session })
      const artisan = product?.artisan_id && await db.collection("artisans").findOne({ id: product.artisan_id, status: "active" }, { session })
      const customer = await db.collection("customers").findOne({ id: actor!.id }, { session })
      if (!product || !artisan || !product.variants?.[0] || !customer) throw new ApiError(404, "This product does not accept custom requests", "not_found")
      const custom = { id: `creq_${randomUUID()}`, artisan_id: artisan.id, customer_id: actor!.id,
        customer_email: customer.email, customer_name: [customer.last_name, customer.first_name].filter(Boolean).join(" ") || null,
        product_id: product.id, variant_id: product.variants[0].id, product_title: product.title, thumbnail: product.thumbnail ?? null,
        description: input.description, color: input.color || null, size: input.size || null, quantity: input.quantity ?? 1,
        status: "pending", quoted_price: null, quoted_lead_days: null, artisan_note: null,
        created_at: new Date(), updated_at: new Date(),
      }
      await db.collection("custom_requests").insertOne(custom, { session })
      await enqueue(db, session, `custom:${custom.id}:created`, "custom_request_changed", { custom_request_id: custom.id, action: "created" })
      return { custom_request: customRequestForCustomer({ ...custom, artisan }) }
    })
  }
  if (isArtisan && resourcePath.length === 3 && resourcePath[2] === "respond") {
    const input = validate(RespondCustomRequestSchema, raw)
    if (input.accept && (!(Number(input.price) > 0) || !(Number(input.lead_days) > 0))) throw new ApiError(400, "Please enter a positive price and production time")
    if (input.accept && !Number.isSafeInteger(input.price)) throw new ApiError(400, "The VND price must be an integer")
    return transaction(async (db, session) => {
      const updated = await db.collection("custom_requests").findOneAndUpdate({ id: resourcePath[1], artisan_id: artisan!.id, status: "pending" }, {
        $set: { status: input.accept ? "quoted" : "artisan_declined", quoted_price: input.accept ? input.price : null,
          quoted_lead_days: input.accept ? input.lead_days : null, artisan_note: input.note || null, responded_at: new Date() },
      }, { session, returnDocument: "after" })
      if (!updated) throw new ApiError(409, "This request does not exist or has already been answered")
      await enqueue(db, session, `custom:${updated.id}:responded`, "custom_request_changed", { custom_request_id: updated.id, action: "responded" })
      return { custom_request: customRequestForArtisan({ ...updated, artisan }) }
    })
  }
  if (isCustomer && resourcePath.length === 3 && resourcePath[2] === "decide") {
    const input = validate(DecideCustomRequestSchema, raw)
    return transaction(async (db, session) => {
      const custom = await db.collection("custom_requests").findOne({ id: resourcePath[1], customer_id: actor!.id }, { session })
      if (!custom) throw new ApiError(404, "Request not found", "not_found")
      const repeat = custom.status === "accepted" && input.accept && input.cart_id
      if (custom.status !== "quoted" && !repeat) throw new ApiError(409, "This request is not awaiting a decision")
      if (input.accept) {
        if (!input.cart_id) throw new ApiError(400, "Cart is required")
        const cart = await ownedCart(db, input.cart_id, actor, session)
        if (cart.customer_id !== actor!.id) throw new ApiError(403, "The cart is not linked to an account")
        if (!cart.items.some((item: Document) => item.metadata?.custom_request_id === custom.id)) {
          if (cart.items.length >= 100) throw new ApiError(400, "Too many items in the cart")
          const line = await pricedLine(db, custom.variant_id, custom.quantity, cart.currency_code, session)
          if (!Number.isSafeInteger(Number(custom.quoted_price)) || Number(custom.quoted_price) <= 0) throw new ApiError(409, "Invalid quote")
          cart.items.push({ ...line, unit_price: Number(custom.quoted_price), metadata: { custom_request_id: custom.id,
            custom_note: [custom.description, custom.color, custom.size].filter(Boolean).join(" · ") } })
          await db.collection("carts").updateOne({ id: cart.id }, { $set: { items: cart.items, shipping_methods: [], updated_at: new Date() } }, { session })
        }
      }
      const status = input.accept ? "accepted" : "customer_declined"
      if (!repeat) {
        await db.collection("custom_requests").updateOne({ id: custom.id, status: "quoted" }, { $set: { status, decided_at: new Date() } }, { session })
        await enqueue(db, session, `custom:${custom.id}:decided`, "custom_request_changed", { custom_request_id: custom.id, action: "decided" })
      }
      const artisan = await db.collection("artisans").findOne({ id: custom.artisan_id }, { session })
      return { custom_request: customRequestForCustomer({ ...custom, status, artisan }) }
    })
  }
  throw new ApiError(405, "Method not allowed")
}
