import { randomUUID } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import * as scryptModule from "scrypt-kdf"
import { database } from "./mongodb"
import { ApiError, text } from "./http"

// Version 3 ships a default runtime export but declares named functions.
const scrypt = (scryptModule as unknown as { default: typeof scryptModule }).default

export type Role = "customer" | "artisan" | "admin"
export type Identity = {
  id: string
  email: string
  password_hash: string
  actors: Partial<Record<Role, string>>
  session_version: number
  created_at: Date
}
export type Actor = { identity_id: string; role: Role; id?: string; email: string }

const ISSUER = "yarnly"
const AUDIENCE = "yarnly-api"
const dummyHash = scrypt.kdf("invalid-password-dummy", { logN: 15, r: 8, p: 1 })

function signingKey() {
  const secret = process.env.AUTH_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("AUTH_SECRET must contain at least 32 bytes")
  return new TextEncoder().encode(secret)
}

export function emailAddress(value: unknown) {
  const email = text(value, "email", 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Invalid email")
  return email
}

export function passwordInput(value: unknown) {
  // Do not trim passwords: spaces are part of an existing user's password.
  if (typeof value !== "string" || value.length < 8 || Buffer.byteLength(value) > 256) {
    throw new ApiError(400, "Password must contain at least 8 characters and at most 256 bytes")
  }
  return value
}

export async function tokenFor(identity: Identity, role: Role) {
  return new SignJWT({ role, version: identity.session_version })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(identity.id).setIssuer(ISSUER).setAudience(AUDIENCE)
    .setIssuedAt().setExpirationTime("7d").sign(signingKey())
}

export async function register(email: unknown, password: unknown, role: Role) {
  // Admins are provisioned by an offline tool, never by a public endpoint.
  if (role === "admin") throw new ApiError(403, "Not allowed", "not_allowed")
  signingKey()
  const address = emailAddress(email)
  const hash = await scrypt.kdf(passwordInput(password), { logN: 15, r: 8, p: 1 })
  const db = await database()
  const identity: Identity = {
    id: `auth_${randomUUID()}`, email: address, password_hash: hash.toString("base64"),
    actors: {}, session_version: 0, created_at: new Date(),
  }
  try {
    await db.collection<Identity>("identities").insertOne(identity)
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ApiError(401, "Identity with email already exists", "unauthorized")
    throw error
  }
  return { token: await tokenFor(identity, role) }
}

export async function login(email: unknown, password: unknown, role: Role) {
  const address = emailAddress(email)
  if (typeof password !== "string" || Buffer.byteLength(password) > 256) throw new ApiError(401, "Incorrect email or password", "unauthorized")
  const db = await database()
  const identity = await db.collection<Identity>("identities").findOne({ email: address })
  // Same KDF work for missing and existing accounts.
  const hash = identity ? Buffer.from(identity.password_hash, "base64") : await dummyHash
  const matches = await scrypt.verify(hash, password).catch(() => false)
  if (!identity || !matches || role === "admin" && !identity.actors.admin) {
    throw new ApiError(401, "Incorrect email or password", "unauthorized")
  }
  return { token: await tokenFor(identity, role) }
}

export async function authenticate(request: Request, role: Role, allowUnregistered = false): Promise<Actor> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "Unauthorized", "unauthorized")
  // Configuration errors must remain 503, rather than look like invalid credentials.
  const key = signingKey()
  let payload
  try {
    payload = (await jwtVerify(authorization.slice(7), key, {
      issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"],
    })).payload
  } catch {
    throw new ApiError(401, "Unauthorized", "unauthorized")
  }
  if (payload.role !== role || typeof payload.sub !== "string") throw new ApiError(401, "Unauthorized", "unauthorized")
  const db = await database()
  const identity = await db.collection<Identity>("identities").findOne({ id: payload.sub })
  if (!identity || identity.session_version !== payload.version || !allowUnregistered && !identity.actors[role]) {
    throw new ApiError(401, "Unauthorized", "unauthorized")
  }
  return { identity_id: identity.id, role, id: identity.actors[role], email: identity.email }
}

export async function revokeSessions(actor: Actor) {
  const db = await database()
  await db.collection<Identity>("identities").updateOne({ id: actor.identity_id }, { $inc: { session_version: 1 } })
}
