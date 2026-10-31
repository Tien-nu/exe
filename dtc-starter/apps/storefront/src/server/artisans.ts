import { randomUUID } from "node:crypto"
import * as scryptModule from "scrypt-kdf"
import type { z } from "zod"
import { authenticate, emailAddress, passwordInput, type Identity } from "./auth"
import { database, transaction } from "./mongodb"
import { ApiError, body, pagination } from "./http"
import { ArtisanProfileSchema, ArtisanProfileUpdateSchema, ArtisanStatusSchema, AdminCreateArtisanSchema, SettingsSchema } from "./validators"
import { enqueue } from "./workflows/sub-orders"
import { provinceName } from "../lib/vietnam-provinces"
import { REGIONAL_SHIPPING } from "./regional-shipping"

// Version 3 ships a default runtime export but declares named functions.
const scrypt = (scryptModule as unknown as { default: typeof scryptModule }).default

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid data")
  return parsed.data
}

export async function artisanFor(request: Request, allowInactive = false) {
  const actor = await authenticate(request, "artisan")
  const db = await database()
  const artisan = await db.collection("artisans").findOne({ id: actor.id }, { projection: { _id: 0, migration_snapshot: 0 } })
  if (!artisan) throw new ApiError(404, "Shop not found", "not_found")
  if (!allowInactive && artisan.status !== "active") throw new ApiError(403, artisan.status === "pending" ? "Your account is awaiting admin approval" : "Your artisan account has been rejected or locked", "not_allowed")
  return artisan
}

export const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)

export async function artisans(request: Request, path: string[]) {
  const method = request.method
  const db = await database()
  if (path[0] === "artisan" && path[1] === "register" && path.length === 2 && method === "POST") {
    const actor = await authenticate(request, "artisan", true)
    const input = validate(ArtisanProfileSchema, await body(request))
    if (emailAddress(input.email) !== actor.email) throw new ApiError(400, "Email does not match the signed-in account")
    return transaction(async (db, session) => {
      const artisan = { ...input, email: actor.email, id: `art_${randomUUID()}`, handle: `${slug(input.shop_name) || "nghe-nhan"}-${randomUUID().slice(0, 8)}`,
        status: "pending", status_reason: null, created_at: new Date(), updated_at: new Date() }
      const linked = await db.collection<Identity>("identities").updateOne({ id: actor.identity_id, "actors.artisan": { $exists: false } }, { $set: { "actors.artisan": artisan.id } }, { session })
      if (!linked.modifiedCount) throw new ApiError(409, "This account already has a shop")
      await db.collection("artisans").insertOne(artisan, { session })
      await enqueue(db, session, `artisan:${artisan.id}:registered`, "artisan_registered", { artisan_id: artisan.id })
      return { artisan }
    })
  }
  if (path[0] === "artisan" && path[1] === "me" && path.length === 2) {
    const artisan = await artisanFor(request, true)
    if (method === "GET") return { artisan }
    if (method === "POST") {
      const input = validate(ArtisanProfileUpdateSchema, await body(request))
      const updated = await db.collection("artisans").findOneAndUpdate({ id: artisan.id }, { $set: { ...input, updated_at: new Date() } }, { returnDocument: "after", projection: { _id: 0, migration_snapshot: 0 } })
      return { artisan: updated }
    }
  }
  if (path[0] !== "admin" || path[1] !== "marketplace" || !["artisans", "settings"].includes(path[2])) return undefined
  await authenticate(request, "admin")
  if (path[2] === "settings" && path.length === 3) {
    if (method === "GET") return { settings: await db.collection("marketplace_settings").findOne({}, { projection: { _id: 0, migration_snapshot: 0 } }), ghn_enabled: false, shipping_policy: REGIONAL_SHIPPING }
    if (method === "POST") {
      const input = validate(SettingsSchema, await body(request))
      const updated = await db.collection("marketplace_settings").findOneAndUpdate({}, { $set: { ...input, admin_email: input.admin_email || null, updated_at: new Date() } }, { returnDocument: "after", projection: { _id: 0, migration_snapshot: 0 } })
      if (!updated) throw new ApiError(409, "Marketplace settings have not been migrated")
      return { settings: updated }
    }
  }
  if (path[2] === "artisans") {
    if (method === "GET" && path.length === 3) {
      const url = new URL(request.url), { limit, offset } = pagination(url)
      const filter = url.searchParams.has("status") ? { status: url.searchParams.get("status") } : {}
      return { artisans: await db.collection("artisans").find(filter, { projection: { _id: 0, migration_snapshot: 0 } }).sort({ created_at: -1 }).skip(offset).limit(limit).toArray(),
        count: await db.collection("artisans").countDocuments(filter), limit, offset }
    }
    if (method === "POST" && path.length === 3) {
      const input = validate(AdminCreateArtisanSchema, await body(request))
      const email = emailAddress(input.email)
      const hash = await scrypt.kdf(passwordInput(input.password), { logN: 15, r: 8, p: 1 })
      return transaction(async (db, session) => {
        if (await db.collection("identities").findOne({ email }, { session })) throw new ApiError(409, "This email already has an account; the artisan must register their own shop")
        const { password, ...profile } = input
        const artisan = { ...profile, email, id: `art_${randomUUID()}`, handle: `${slug(input.shop_name) || "nghe-nhan"}-${randomUUID().slice(0, 8)}`, status: "active", created_at: new Date(), updated_at: new Date() }
        await db.collection("identities").insertOne({ id: `auth_${randomUUID()}`, email, password_hash: hash.toString("base64"), actors: { artisan: artisan.id }, session_version: 0, created_at: new Date() }, { session })
        await db.collection("artisans").insertOne(artisan, { session })
        await enqueue(db, session, `artisan:${artisan.id}:created`, "artisan_created", { artisan_id: artisan.id })
        return { artisan }
      })
    }
    if (method === "POST" && path.length === 5 && path[4] === "pickup-province") {
      const province = provinceName((await body(request)).pickup_province_name)
      if (!province) throw new ApiError(400, "Please select a valid pickup province or city")
      const updated = await db.collection("artisans").findOneAndUpdate({ id: path[3] }, { $set: { pickup_province_name: province, updated_at: new Date() } }, { returnDocument: "after", projection: { _id: 0, migration_snapshot: 0 } })
      if (!updated) throw new ApiError(404, "Shop not found")
      return { artisan: updated }
    }
    if (method === "POST" && path.length === 5 && path[4] === "status") {
      const input = validate(ArtisanStatusSchema, await body(request))
      return transaction(async (db, session) => {
        const previous = await db.collection("artisans").findOne({ id: path[3] }, { session })
        if (!previous) throw new ApiError(404, "Artisan not found", "not_found")
        await db.collection("artisans").updateOne({ id: path[3] }, { $set: { status: input.status, status_reason: input.status === "active" ? null : input.reason ?? null, updated_at: new Date() } }, { session })
        if (input.status === "locked") await db.collection("products").updateMany({ artisan_id: path[3], status: "published" }, { $set: { status: "draft", "metadata.hidden_by_lock": true } }, { session })
        if (input.status === "active" && previous.status === "locked") await db.collection("products").updateMany({ artisan_id: path[3], "metadata.hidden_by_lock": true }, { $set: { status: "published", "metadata.hidden_by_lock": false } }, { session })
        await enqueue(db, session, `artisan:${path[3]}:${input.status}:${randomUUID()}`, "artisan_status_changed", { artisan_id: path[3], status: input.status, reason: input.reason ?? null })
        const { _id, migration_snapshot, ...publicArtisan } = previous
        return { artisan: { ...publicArtisan, status: input.status, status_reason: input.status === "active" ? null : input.reason ?? null } }
      })
    }
  }
  throw new ApiError(405, "Method not allowed")
}
