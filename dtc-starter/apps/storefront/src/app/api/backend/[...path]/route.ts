import { authenticate, emailAddress, login, register, revokeSessions, type Role } from "../../../../server/auth"
import { catalog } from "../../../../server/catalog"
import { customers } from "../../../../server/customers"
import { ApiError, body, errorResponse, json } from "../../../../server/http"
import { rateLimit } from "../../../../server/rate-limit"
import { marketplace } from "../../../../server/marketplace"
import { carts } from "../../../../server/carts"
import { checkout } from "../../../../server/checkout"
import { shipping } from "../../../../server/shipping"
import { artisans } from "../../../../server/artisans"
import { artisanProducts } from "../../../../server/artisan-products"
import { customRequests } from "../../../../server/custom-requests"
import { orders } from "../../../../server/orders"
import { ghnAddresses } from "../../../../server/ghn-addresses"
import { uploads } from "../../../../server/uploads"
import { verification } from "../../../../server/verification"
import { adminCatalog } from "../../../../server/admin-catalog"
import { ghnShipping } from "../../../../server/ghn-shipping"
import { search } from "../../../../server/search"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }

async function handle(request: Request, context: Context) {
  try {
    // This namespace is a staging implementation. Keep production storefront
    // on its existing backend until the parity checklist has passed.
    if (process.env.MONGODB_API_PREVIEW !== "true") throw new ApiError(404, "Not found", "not_found")
    const { path } = await context.params
    const catalogAdmin = await adminCatalog(request, path)
    if (catalogAdmin !== undefined) return json(catalogAdmin)
    const shipment = await ghnShipping(request, path)
    if (shipment !== undefined) return json(shipment)
    if (path[0] === "auth" && path[1] === "verification") {
      const result = await verification(request, path)
      if (result !== undefined) return json(result)
    }
    if (path[0] === "auth") {
      if (path[1] === "session" && path.length === 2 && request.method === "DELETE") {
        // The customer SDK's logout uses DELETE /auth/session.
        await revokeSessions(await authenticate(request, "customer", true))
        return json({ success: true })
      }
      const role = path[1] === "user" ? "admin" : path[1]
      if (!["customer", "artisan", "admin"].includes(role) || path[2] !== "emailpass" ||
          path.length > 4 || path[3] && path[3] !== "register" || request.method !== "POST") {
        throw new ApiError(404, "Not found", "not_found")
      }
      const input = await body(request)
      const email = emailAddress(input.email)
      await rateLimit(`auth:email:${email}`)
      const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "local"
      await rateLimit(`auth:network:${forwarded.split(",")[0].trim()}`, 50)
      return json(await (path[3] === "register" ? register : login)(email, input.password, role as Role))
    }
    if (path[0] === "store" && path[1] === "customers") return json(await customers(request, path.slice(1)))
    if (path.length === 2 && path[0] === "store" && path[1] === "search" && request.method === "POST") return json(await search(request))
    if (path[0] === "store" && path[1] === "orders") return json(await orders(request, path.slice(1)))
    if (path[0] === "store" && ["ghn", "addresses"].includes(path[1])) {
      const result = await ghnAddresses(request, path.slice(1))
      if (result !== undefined) return json(result)
    }
    if (path[0] === "store" && path[1] === "carts" && !["complete", "shipping-methods"].includes(path[3])) return json(await carts(request, path.slice(1)))
    if (path[0] === "store" && ["payment-providers", "payment-collections", "carts"].includes(path[1])) {
      const result = await checkout(request, path.slice(1))
      if (result !== undefined) return json(result)
    }
    if (path[0] === "store" && ["shipping-options", "carts"].includes(path[1])) {
      const result = await shipping(request, path.slice(1))
      if (result !== undefined) return json(result)
    }
    if (path[0] === "artisan" || path[1] === "marketplace") {
      for (const handler of [artisans, artisanProducts, customRequests, uploads]) {
        const result = await handler(request, path)
        if (result !== undefined) return json(result)
      }
      const result = await marketplace(request, path)
      if (result !== undefined) return json(result)
    }
    if (path[0] === "store" && request.method === "GET") {
      const result = await catalog(path.slice(1), new URL(request.url))
      if (result !== undefined) return json(result)
    }
    // An incomplete migration must fail explicitly, never silently proxy to
    // Render or acknowledge an unimplemented payment/shipping operation.
    throw new ApiError(501, "This feature has not been migrated to MongoDB", "not_implemented")
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = handle
export const POST = handle
export const DELETE = handle
