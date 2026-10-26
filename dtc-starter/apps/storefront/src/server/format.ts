import { DAY, HOUR } from "./domain/order-rules"
const VN_UTC_OFFSET_HOURS = 7

export const formatVnd = (amount: unknown) =>
  `${new Intl.NumberFormat("en-US").format(Number(amount ?? 0))}₫`

export const formatDateTime = (value: Date | string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : ""

export const formatDate = (value: Date | string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : ""

export const addMs = (date: Date, ms: number) => new Date(date.getTime() + ms)

/** Monday 00:00 in Vietnam of the week `date` falls in, as a UTC instant. */
export const vnWeekStart = (date: Date) => {
  const vn = new Date(date.getTime() + VN_UTC_OFFSET_HOURS * HOUR)
  // getUTCDay on the shifted date is the weekday in Vietnam (Sunday = 0).
  const daysSinceMonday = (vn.getUTCDay() + 6) % 7
  const vnMidnight = Date.UTC(
    vn.getUTCFullYear(),
    vn.getUTCMonth(),
    vn.getUTCDate()
  )

  return new Date(
    vnMidnight - daysSinceMonday * DAY - VN_UTC_OFFSET_HOURS * HOUR
  )
}

/** URL-safe handle from a Vietnamese title. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
