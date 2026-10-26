import { createHmac, timingSafeEqual } from "node:crypto"
import { ApiError } from "./http"

export const simulatedPaymentsEnabled = () =>
  process.env.PAYMENT_MODE === "simulation"

function signature(payload: string) {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new ApiError(503, "QR payment is not configured")
  return createHmac("sha256", secret)
    .update(`simulation-qr:${payload}`)
    .digest("base64url")
}

export function createQrPaymentToken(order: {
  id: string
  payment_deadline: Date | string
}) {
  const payload = Buffer.from(
    JSON.stringify({ id: order.id, exp: +new Date(order.payment_deadline) })
  ).toString("base64url")
  return `${payload}.${signature(payload)}`
}

export function verifyQrPaymentToken(token: string) {
  if (!simulatedPaymentsEnabled())
    throw new ApiError(404, "QR payment is unavailable")
  if (token.length > 2048) throw new ApiError(401, "Invalid payment QR")
  const [payload, signed, extra] = token.split(".")
  if (!payload || !signed || extra)
    throw new ApiError(401, "Invalid payment QR")
  const actual = new TextEncoder().encode(signed)
  const expected = new TextEncoder().encode(signature(payload))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ApiError(401, "Invalid payment QR")
  let value
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString())
  } catch {
    throw new ApiError(401, "Invalid payment QR")
  }
  if (typeof value?.id !== "string" || !Number.isFinite(value.exp))
    throw new ApiError(401, "Invalid payment QR")
  if (value.exp <= Date.now())
    throw new ApiError(
      410,
      "This payment QR has expired. Please place a new order."
    )
  return value as { id: string; exp: number }
}
