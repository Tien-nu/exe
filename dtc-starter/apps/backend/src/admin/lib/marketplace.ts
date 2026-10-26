/** Calls the marketplace admin API with the dashboard's session cookie. */
export async function api<T = any>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const response = await fetch(`/admin/marketplace${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message ?? response.statusText)
  }

  return data as T
}

export const formatVnd = (amount: unknown) =>
  `${new Intl.NumberFormat("en-US").format(Number(amount ?? 0))}₫`

export const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "–"

export const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    : "–"

export const SUB_ORDER_STATUS: Record<
  string,
  { label: string; color: "grey" | "orange" | "blue" | "green" | "red" | "purple" }
> = {
  pending_payment: { label: "Awaiting payment", color: "grey" },
  pending_acceptance: { label: "Awaiting artisan acceptance", color: "orange" },
  processing: { label: "In production / preparing", color: "blue" },
  ready_to_ship: { label: "Awaiting shipment", color: "purple" },
  shipping: { label: "Shipping", color: "blue" },
  delivered: { label: "Delivered", color: "green" },
  completed: { label: "Completed", color: "green" },
  canceled: { label: "Canceled", color: "red" },
}

export const PAYMENT_STATUS: Record<
  string,
  { label: string; color: "grey" | "orange" | "blue" | "green" | "red" | "purple" }
> = {
  cod: { label: "COD", color: "grey" },
  awaiting_transfer: { label: "Awaiting customer transfer", color: "orange" },
  transfer_submitted: { label: "Customer reported payment", color: "purple" },
  paid: { label: "Payment received", color: "green" },
  expired: { label: "10-minute deadline expired", color: "red" },
  rejected: { label: "Payment not received", color: "red" },
}

/** Latest status reported by GHN's webhook. */
export const GHN_STATUS: Record<string, string> = {
  ready_to_pick: "Awaiting pickup",
  picking: "Pickup in progress",
  picked: "Picked up",
  storing: "In warehouse",
  transporting: "In transit",
  sorting: "Sorting",
  delivering: "Shipping",
  delivered: "Delivered",
  delivery_fail: "Delivery failed",
  waiting_to_return: "Awaiting return",
  return: "Returning",
  returning: "Returning",
  returned: "Returned",
  cancel: "Shipment canceled",
  exception: "Shipment issue",
  damage: "Damaged",
  lost: "Lost",
}

export const ARTISAN_STATUS: Record<
  string,
  { label: string; color: "grey" | "orange" | "blue" | "green" | "red" | "purple" }
> = {
  pending: { label: "Pending approval", color: "orange" },
  active: { label: "Active", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  locked: { label: "Locked", color: "grey" },
}
