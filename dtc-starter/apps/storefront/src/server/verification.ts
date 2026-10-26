import { createHash, randomBytes } from "node:crypto"
import { authenticate } from "./auth"
import { transaction } from "./mongodb"
import { ApiError, body, text } from "./http"
import { rateLimit } from "./rate-limit"
import { enqueue } from "./workflows/sub-orders"

export async function verification(request: Request, path: string[]) {
  if (path[0] !== "auth" || path[1] !== "verification" || path.length !== 3 || request.method !== "POST") return undefined
  const input = await body(request)
  if (path[2] === "request") {
    const actor = await authenticate(request, "customer", true)
    if (input.entity_type !== "email" || input.entity_id !== actor.email) throw new ApiError(400, "Email does not match the account")
    await rateLimit(`verify:${actor.identity_id}`, 5, 60 * 60_000)
    const code = randomBytes(32).toString("base64url")
    const hash = createHash("sha256").update(code).digest("hex")
    await transaction(async (db, session) => {
      await db.collection("email_verifications").updateOne({ identity_id: actor.identity_id }, { $set: {
        token_hash: hash, expires_at: new Date(Date.now() + 15 * 60_000), created_at: new Date(),
      } }, { session, upsert: true })
      await enqueue(db, session, `verification:${hash}`, "email_verification", { to: actor.email, code })
    })
    return { success: true }
  }
  if (path[2] === "confirm") {
    const hash = createHash("sha256").update(text(input.code, "code", 200)).digest("hex")
    return transaction(async (db, session) => {
      const token = await db.collection("email_verifications").findOneAndDelete({ token_hash: hash, expires_at: { $gt: new Date() } }, { session })
      if (!token) throw new ApiError(400, "The verification link is invalid or expired")
      await db.collection("identities").updateOne({ id: token.identity_id }, { $set: { email_verified_at: new Date() } }, { session })
      return { success: true }
    })
  }
  throw new ApiError(404, "Not found", "not_found")
}
