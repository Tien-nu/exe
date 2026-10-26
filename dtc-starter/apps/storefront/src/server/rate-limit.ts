import { createHash } from "node:crypto"
import { database } from "./mongodb"
import { ApiError } from "./http"

export async function rateLimit(key: string, maximum = 10, windowMs = 15 * 60_000) {
  const db = await database()
  const bucket = Math.floor(Date.now() / windowMs)
  const id = createHash("sha256").update(`${key}:${bucket}`).digest("hex")
  const limits = db.collection<{ _id: string; count: number; expires_at: Date }>("rate_limits")
  let limit
  try {
    limit = await limits.findOneAndUpdate({ _id: id }, {
      $inc: { count: 1 },
      $setOnInsert: { expires_at: new Date((bucket + 2) * windowMs) },
    }, { upsert: true, returnDocument: "after" })
  } catch (error) {
    // Concurrent first requests may race on upsert; increment the winner.
    if ((error as { code?: number }).code !== 11000) throw error
    limit = await limits.findOneAndUpdate({ _id: id }, { $inc: { count: 1 } }, { returnDocument: "after" })
  }
  if (!limit || limit.count > maximum) throw new ApiError(429, "Please try again later", "too_many_requests")
}
