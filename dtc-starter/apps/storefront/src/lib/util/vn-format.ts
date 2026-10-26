export const formatVnd = (amount: number | null | undefined) =>
  `${new Intl.NumberFormat("en-US").format(Number(amount ?? 0))}₫`

export const formatDateTime = (value: string | null | undefined) =>
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

export const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    : ""

/** Tailwind classes per sub-order status, shared by customer and artisan pages. */
export const SUB_ORDER_BADGE: Record<string, string> = {
  pending_payment: "bg-gray-100 text-gray-700",
  pending_acceptance: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  ready_to_ship: "bg-violet-100 text-violet-800",
  shipping: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  canceled: "bg-red-100 text-red-700",
}
