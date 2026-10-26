export class ApiError extends Error {
  constructor(public status: number, message: string, public type = "invalid_data") {
    super(message)
  }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } })
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 256_000) throw new ApiError(413, "Request too large")
  if (!raw.trim()) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error()
    return value
  } catch {
    throw new ApiError(400, "Invalid JSON body")
  }
}

export function text(value: unknown, name: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ApiError(400, `Invalid ${name}`)
  }
  return value.trim()
}

export function pagination(url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 20)
  const offset = Number(url.searchParams.get("offset") ?? 0)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    throw new ApiError(400, "Invalid pagination")
  }
  return { limit, offset }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return json({ type: error.type, message: error.message }, error.status)
  // Never send database errors (which can contain connection details) to users.
  console.error("Yarnly API failure", error instanceof Error ? error.name : "UnknownError")
  return json({ type: "unexpected_state", message: "Service temporarily unavailable" }, 503)
}
