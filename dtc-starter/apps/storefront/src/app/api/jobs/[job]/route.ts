import { timingSafeEqual } from "node:crypto"
import { runTimers } from "../../../../server/timers"
import { processOutbox } from "../../../../server/outbox"
import { generatePayouts } from "../../../../server/workflows/payouts"
import { ApiError, errorResponse, json } from "../../../../server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request, context: { params: Promise<{ job: string }> }) {
  try {
    if (process.env.MONGODB_API_PREVIEW !== "true") throw new ApiError(404, "Not found", "not_found")
    const secret = process.env.CRON_SECRET
    if (!secret || Buffer.byteLength(secret) < 32) throw new ApiError(503, "Scheduled jobs are not configured")
    const actual = new TextEncoder().encode(request.headers.get("authorization") ?? "")
    const expected = new TextEncoder().encode(`Bearer ${secret}`)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, "Unauthorized", "unauthorized")
    const { job } = await context.params
    if (job === "timers") return json(await runTimers())
    if (job === "notifications") return json(await processOutbox(10))
    if (job === "payouts") return json({ created: (await generatePayouts()).length })
    throw new ApiError(404, "Not found", "not_found")
  } catch (error) { return errorResponse(error) }
}
