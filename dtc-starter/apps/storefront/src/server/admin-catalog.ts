import { uploads } from "./uploads"
import { authenticate } from "./auth"
import { artisanProducts, productViews } from "./artisan-products"
import { database } from "./mongodb"
import { ApiError, body, pagination, text } from "./http"

export async function adminCatalog(request: Request, path: string[]) {
  if (
    path[0] !== "admin" ||
    path[1] !== "catalog" ||
    !["products", "customers", "categories", "uploads"].includes(path[2]) ||
    path.length > 5
  )
    return undefined
  const actor = await authenticate(request, "admin")
  if (path[2] === "uploads")
    return uploads(request, ["artisan", ...path.slice(2)], { id: actor.id! })
  if (path.length > 4) throw new ApiError(404, "Not found")
  const db = await database(),
    id = path[3]
  if (path[2] === "categories") {
    if (request.method !== "GET") throw new ApiError(405, "Method not allowed")
    return {
      categories: await db
        .collection("product_categories")
        .find(
          { is_active: true, is_internal: { $ne: true }, deleted_at: null },
          { projection: { _id: 0, id: 1, name: 1 } }
        )
        .limit(100)
        .toArray(),
    }
  }
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200)
  const escaped = query?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  if (path[2] === "customers") {
    if (request.method !== "GET") throw new ApiError(405, "Method not allowed")
    const { limit, offset } = pagination(new URL(request.url)),
      filter = {
        deleted_at: null,
        ...(id ? { id } : {}),
        ...(escaped
          ? {
              $or: ["email", "first_name", "last_name"].map((field) => ({
                [field]: { $regex: escaped, $options: "i" },
              })),
            }
          : {}),
      }
    const customers = await db
      .collection("customers")
      .find(filter, {
        projection: {
          _id: 0,
          id: 1,
          email: 1,
          first_name: 1,
          last_name: 1,
          phone: 1,
          created_at: 1,
          has_account: 1,
          addresses: 1,
        },
      })
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray()
    return {
      customers,
      count: await db.collection("customers").countDocuments(filter),
      limit,
      offset,
    }
  }
  if (request.method === "GET") {
    const { limit, offset } = pagination(new URL(request.url)),
      filter = {
        deleted_at: null,
        ...(id ? { id } : {}),
        ...(escaped ? { title: { $regex: escaped, $options: "i" } } : {}),
      }
    const products = await db
      .collection("products")
      .find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray()
    return {
      products: await productViews(products),
      count: await db.collection("products").countDocuments(filter),
      limit,
      offset,
    }
  }
  const current = id
    ? await db.collection("products").findOne({ id, deleted_at: null })
    : null
  if (id && !current) throw new ApiError(404, "Product not found")
  const artisanId =
    current?.artisan_id ??
    text((await body(request.clone())).artisan_id, "artisan_id")
  const artisan = await db.collection("artisans").findOne({ id: artisanId })
  if (!artisan) throw new ApiError(404, "Artisan not found")
  // Reuse the same validation, stock reservations and publication transaction.
  return artisanProducts(
    request,
    ["artisan", "products", ...(id ? [id] : [])],
    artisan
  )
}
