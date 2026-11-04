import { createQrPaymentToken, simulatedPaymentsEnabled } from "./qr-payment-token"
// Response contract ported from the deployed marketplace serializer.
import { SUB_ORDER_STATUS_LABELS } from "./status-labels"
import { GHN_STATUS_LABELS, ghnTrackingUrl } from "./status-labels"
import { toNumber } from "./numbers"

const itemFields = (item: any) => ({
  id: item.id,
  line_item_id: item.line_item_id,
  product_id: item.product_id,
  title: item.title,
  variant_title: item.variant_title,
  thumbnail: item.thumbnail,
  made_to_order: item.made_to_order,
  quantity: item.quantity,
  unit_price: toNumber(item.unit_price),
  total: toNumber(item.total),
})

const timeline = (sub: any) => ({
  created_at: sub.created_at,
  accept_deadline: sub.accept_deadline,
  accepted_at: sub.accepted_at,
  due_date: sub.due_date,
  ready_at: sub.ready_at,
  shipped_at: sub.shipped_at,
  delivered_at: sub.delivered_at,
  complete_at: sub.complete_at,
  completed_at: sub.completed_at,
  canceled_at: sub.canceled_at,
})

const common = (sub: any) => ({
  id: sub.id,
  code: sub.code,
  status: sub.status,
  status_label: SUB_ORDER_STATUS_LABELS[sub.status] ?? sub.status,
  is_custom: sub.is_custom,
  made_to_order: sub.made_to_order,
  lead_days: sub.lead_days,
  subtotal: toNumber(sub.subtotal),
  // Paid by the customer at checkout for this parcel; null for orders from
  // before that, whose shipping is paid to the shipper on delivery.
  shipping_charged:
    sub.shipping_charged === null || sub.shipping_charged === undefined
      ? null
      : toNumber(sub.shipping_charged),
  carrier: sub.carrier,
  tracking_number: sub.tracking_number,
  tracking_url:
    sub.carrier === "GHN" && sub.tracking_number ? ghnTrackingUrl(sub.tracking_number) : null,
  carrier_status: sub.carrier_status ?? null,
  carrier_status_label: sub.carrier_status
    ? GHN_STATUS_LABELS[sub.carrier_status] ?? sub.carrier_status
    : null,
  shipping_fee: sub.shipping_fee === null || sub.shipping_fee === undefined ? null : toNumber(sub.shipping_fee),
  expected_delivery_at: sub.expected_delivery_at ?? null,
  canceled_by: sub.canceled_by,
  cancel_reason: sub.cancel_reason,
  items: (sub.items ?? []).map(itemFields),
  ...timeline(sub),
})

export const publicArtisan = (artisan: any) =>
  artisan && {
    id: artisan.id,
    handle: artisan.handle,
    shop_name: artisan.shop_name,
    description: artisan.description,
    avatar_url: artisan.avatar_url,
  }

/** What the artisan sees: no customer contact details, like on Shopee. */
export const subOrderForArtisan = (sub: any, customRequest?: any) => ({
  ...common(sub),
  payment_method: sub.marketplace_order?.payment_method,
  payout_id: sub.payout_id,
  custom_request: customRequest
    ? {
        description: customRequest.description,
        color: customRequest.color,
        size: customRequest.size,
        quantity: customRequest.quantity,
        quoted_price: toNumber(customRequest.quoted_price),
        quoted_lead_days: customRequest.quoted_lead_days,
        artisan_note: customRequest.artisan_note,
      }
    : null,
})

export const subOrderForCustomer = (sub: any) => ({
  ...common(sub),
  refund_status: sub.refund_status,
  artisan: publicArtisan(sub.artisan),
})

const activeSubOrders = (order: any) =>
  (order.sub_orders ?? []).filter((sub: any) => sub.status !== "canceled")

/** What the customer pays for one sub-order: its goods and its shipping. */
export const subOrderAmount = (sub: any) =>
  toNumber(sub.subtotal) + toNumber(sub.shipping_charged ?? 0)

export const marketplaceOrderForCustomer = (order: any, settings?: any) => ({
  id: order.id,
  order_id: order.order_id,
  display_id: order.display_id,
  payment_method: order.payment_method,
  payment_status: order.payment_status,
  payment_mode: order.payment_mode ?? "bank",
  payment_provider: order.payment_provider ?? null,
  payment_url: order.payment_url ?? null,
  qr_payment_token: simulatedPaymentsEnabled() && order.payment_mode === "simulation" && order.payment_status === "awaiting_transfer" && order.payment_deadline && +new Date(order.payment_deadline) > Date.now() ? createQrPaymentToken(order) : null,
  payment_deadline: order.payment_deadline,
  transfer_submitted_at: order.transfer_submitted_at,
  paid_at: order.paid_at,
  items_total: toNumber(order.items_total),
  shipping_total: activeSubOrders(order).reduce(
    (sum: number, sub: any) => sum + toNumber(sub.shipping_charged ?? 0),
    0
  ),
  // What is still owed by transfer (goods + shipping): canceled sub-orders drop out.
  amount_to_transfer: activeSubOrders(order).reduce(
    (sum: number, sub: any) => sum + subOrderAmount(sub),
    0
  ),
  transfer_content: `YARNLY ${order.display_id}`,
  bank: settings
    ? {
        name: settings.bank_name,
        code: settings.bank_code,
        account_number: settings.bank_account_number,
        account_name: settings.bank_account_name,
      }
    : null,
  created_at: order.created_at,
  sub_orders: (order.sub_orders ?? [])
    .sort((a: any, b: any) => a.code.localeCompare(b.code))
    .map(subOrderForCustomer),
})

export const customRequestForCustomer = (request: any) => ({
  id: request.id,
  status: request.status,
  product_id: request.product_id,
  product_title: request.product_title,
  thumbnail: request.thumbnail,
  description: request.description,
  color: request.color,
  size: request.size,
  quantity: request.quantity,
  quoted_price: request.quoted_price === null ? null : toNumber(request.quoted_price),
  quoted_lead_days: request.quoted_lead_days,
  artisan_note: request.artisan_note,
  responded_at: request.responded_at,
  decided_at: request.decided_at,
  order_id: request.order_id,
  created_at: request.created_at,
  artisan: publicArtisan(request.artisan),
})

export const customRequestForArtisan = (request: any) => {
  const { artisan: _artisan, ...rest } = customRequestForCustomer(request)

  return {
    ...rest,
    customer_name: request.customer_name,
  }
}
