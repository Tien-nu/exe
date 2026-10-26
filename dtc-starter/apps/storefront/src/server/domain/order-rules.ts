// Ported from the deployed marketplace rules. Pure functions are shared by
// requests and cron processing so timing/permission rules cannot drift.
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const PAYMENT_WINDOW = 10 * MINUTE
export const ACCEPT_WINDOW = 12 * HOUR
export const COMPLETE_WINDOW = 2 * DAY

export type Status = "pending_payment" | "pending_acceptance" | "processing" |
  "ready_to_ship" | "shipping" | "delivered" | "completed" | "canceled"
export type Role = "customer" | "artisan" | "admin" | "system"
export type SubOrder = {
  status: Status
  customer_id: string
  artisan_id: string
  accept_deadline?: Date | string | null
  complete_at?: Date | string | null
  lead_days?: number | null
  is_custom?: boolean
}

export function startState(sub: Pick<SubOrder, "is_custom" | "lead_days">, now: Date) {
  return sub.is_custom
    ? { status: "processing" as const, accepted_at: now,
        due_date: new Date(+now + (sub.lead_days ?? 0) * DAY) }
    : { status: "pending_acceptance" as const, accept_deadline: new Date(+now + ACCEPT_WINDOW) }
}

export function transition(sub: SubOrder, action: string, actor: { role: Role; id: string }, now: Date) {
  if (actor.role === "customer" && sub.customer_id !== actor.id ||
      actor.role === "artisan" && sub.artisan_id !== actor.id) throw new Error("not_found")

  if (action === "cancel" || action === "decline") {
    const allowed = actor.role === "customer"
      ? ["pending_payment", "pending_acceptance"]
      : actor.role === "artisan" ? ["pending_acceptance"]
      : ["pending_payment", "pending_acceptance", "processing", "ready_to_ship", "shipping", "delivered"]
    if (action === "decline" && actor.role !== "artisan" || !allowed.includes(sub.status)) {
      throw new Error("not_allowed")
    }
    return { status: "canceled" as const, canceled_at: now, canceled_by: actor.role }
  }
  if (action === "accept" && actor.role === "artisan" && sub.status === "pending_acceptance") {
    if (sub.accept_deadline && +new Date(sub.accept_deadline) < +now) throw new Error("deadline_passed")
    return { status: "processing" as const, accepted_at: now,
      due_date: sub.lead_days ? new Date(+now + sub.lead_days * DAY) : null }
  }
  if (action === "ready" && actor.role === "artisan" && sub.status === "processing") {
    return { status: "ready_to_ship" as const, ready_at: now }
  }
  if (action === "ship" && actor.role === "admin" && sub.status === "ready_to_ship") {
    return { status: "shipping" as const, shipped_at: now }
  }
  if (action === "deliver" && actor.role === "admin" && sub.status === "shipping") {
    return { status: "delivered" as const, delivered_at: now, complete_at: new Date(+now + COMPLETE_WINDOW) }
  }
  if (action === "complete" && actor.role === "system" && sub.status === "delivered" &&
      sub.complete_at && +new Date(sub.complete_at) < +now) {
    return { status: "completed" as const, completed_at: now }
  }
  throw new Error("not_allowed")
}

export function weekStartVietnam(date: Date) {
  const local = new Date(+date + 7 * HOUR)
  const days = (local.getUTCDay() + 6) % 7
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - days * DAY - 7 * HOUR)
}

export function payoutAmounts(subtotals: number[], feePercent: number) {
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100 ||
      subtotals.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) throw new Error("invalid_amount")
  const gross = subtotals.reduce((sum, amount) => sum + amount, 0)
  if (!Number.isSafeInteger(gross)) throw new Error("invalid_amount")
  const fee = Math.round(gross * feePercent / 100)
  return { gross_amount: gross, fee_amount: fee, net_amount: gross - fee }
}
