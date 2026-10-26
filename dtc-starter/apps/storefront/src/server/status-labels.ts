export const SUB_ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  pending_acceptance: "Awaiting artisan confirmation",
  processing: "In production / preparing",
  ready_to_ship: "Ready — awaiting shipment",
  shipping: "Shipping",
  delivered: "Delivered",
  completed: "Completed",
  canceled: "Canceled",
}

export const GHN_STATUS_LABELS: Record<string, string> = {
  ready_to_pick: "Awaiting pickup",
  picking: "Pickup in progress",
  money_collect_picking: "Pickup in progress",
  picked: "Picked up",
  storing: "In warehouse",
  transporting: "In transit",
  sorting: "Sorting",
  delivering: "Shipping",
  money_collect_delivering: "Shipping",
  delivered: "Delivered",
  delivery_fail: "Delivery failed",
  waiting_to_return: "Awaiting return",
  return: "Returning",
  return_transporting: "Returning",
  return_sorting: "Returning",
  returning: "Returning",
  return_fail: "Return failed",
  returned: "Returned to shop",
  cancel: "Shipment canceled",
  exception: "Shipment issue",
  damage: "Damaged",
  lost: "Lost",
}

export const ghnTrackingUrl = (code: string) => `https://donhang.ghn.vn/?order_code=${encodeURIComponent(code)}`
