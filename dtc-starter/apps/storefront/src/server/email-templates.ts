// Existing transactional email content, ported without a Medusa runtime.
import type { EmailContext as MedusaContainer, MarketplaceEmailService as MarketplaceModuleService } from "./email-context"
import { STOREFRONT_URL } from "./email-context"
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatVnd,
} from "./format"
import { link, notifyAdmin, paragraph, sendEmail } from "./email-context"
import { subOrderAmount } from "./marketplace-view"

const ARTISAN_PORTAL_URL = `${STOREFRONT_URL}/kenh-nghe-nhan`

type Item = {
  title: string
  variant_title?: string | null
  quantity: number
  total: unknown
}

type Artisan = {
  id: string
  shop_name: string
  email: string
  phone?: string
  pickup_address?: string
}

export type FullSubOrder = {
  id: string
  code: string
  status: string
  lead_days?: number | null
  subtotal: unknown
  shipping_charged?: unknown
  due_date?: Date | string | null
  accept_deadline?: Date | string | null
  carrier?: string | null
  tracking_number?: string | null
  shipping_fee?: unknown
  cancel_reason?: string | null
  refund_status?: string
  shipping_name?: string | null
  shipping_phone?: string | null
  shipping_address?: string | null
  items: Item[]
  artisan: Artisan
  marketplace_order: {
    id: string
    order_id: string
    display_id: number
    email: string
    payment_method: string
    payment_status: string
  }
}

const itemsTable = (items: Item[]) => `
<table style="width:100%;border-collapse:collapse;font-size:14px">
  ${items
    .map(
      (item) => `<tr>
    <td style="padding:6px 0;border-bottom:1px solid #eee">${item.quantity} × ${escapeHtml(item.title)}${
        item.variant_title ? ` <span style="color:#6b7280">(${escapeHtml(item.variant_title)})</span>` : ""
      }</td>
    <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${formatVnd(item.total)}</td>
  </tr>`
    )
    .join("")}
</table>`

const orderLink = (sub: FullSubOrder) =>
  link(`${STOREFRONT_URL}/account/orders/details/${sub.marketplace_order.order_id}`, "View order")

export async function emailOrderPlaced(
  container: MedusaContainer,
  marketplaceOrderId: string
) {
  const marketplace: MarketplaceModuleService =
    container.marketplace
  const order = await marketplace.retrieveMarketplaceOrder(marketplaceOrderId, {
    relations: ["sub_orders", "sub_orders.items", "sub_orders.artisan"],
  })

  const subOrders = order.sub_orders
    .map(
      (sub) =>
        `<h4 style="margin-bottom:4px">Order ${escapeHtml(sub.code)} – ${escapeHtml(sub.artisan.shop_name)}</h4>${itemsTable(sub.items as Item[])}${paragraph(`Shipping: ${formatVnd(sub.shipping_charged ?? 0)}`)}`
    )
    .join("")

  const total = order.sub_orders.reduce((sum, sub) => sum + subOrderAmount(sub), 0)
  const shops = [...new Set(order.sub_orders.map((sub) => sub.artisan.shop_name))]

  const payment =
    order.payment_method === "bank_transfer"
      ? paragraph(
          `You selected <b>bank transfer</b>. Please transfer <b>${formatVnd(total)}</b> (items + shipping) within <b>10 minutes</b> (before ${formatDateTime(order.payment_deadline)}) and select "I have transferred payment" on the order page, or your order will be automatically canceled.`
        )
      : paragraph(
          `You selected <b>cash on delivery (COD)</b>: the carrier will collect <b>${formatVnd(total)}</b> (items + shipping), split across each parcel.`
        )

  await sendEmail(
    container,
    order.email,
    `Order placed – order #${order.display_id}`,
    paragraph(
      `Thank you for ordering from Yarnly. Your order contains ${order.sub_orders.length} parcels from ${shops.map(escapeHtml).join(", ")}, each delivered separately.`
    ) +
      payment +
      subOrders +
      link(`${STOREFRONT_URL}/account/orders/details/${order.order_id}`, "View order")
  )
}

export async function emailArtisanNewSubOrder(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  const action =
    sub.status === "processing"
      ? paragraph(
          `This is a <b>custom order</b> you have accepted. Completion deadline: <b>${formatDate(sub.due_date)}</b>.`
        )
      : paragraph(
          `Please accept this order before <b>${formatDateTime(sub.accept_deadline)}</b> (12 hours). Otherwise, it will be automatically canceled.`
        )

  await sendEmail(
    container,
    sub.artisan.email,
    `You have a new order ${sub.code}`,
    action +
      itemsTable(sub.items) +
      paragraph(`Items total: <b>${formatVnd(sub.subtotal)}</b>`) +
      link(`${ARTISAN_PORTAL_URL}/don-hang/${sub.id}`, "Open order")
  )
}

export async function emailPaymentConfirmed(
  container: MedusaContainer,
  order: { id: string; email: string; display_id: number; order_id: string }
) {
  const marketplace: MarketplaceModuleService = container.marketplace
  const subOrders = await marketplace.listSubOrders(
    { marketplace_order_id: order.id },
    { relations: ["artisan"] }
  )
  const shops = [...new Set(subOrders.map((sub) => sub.artisan.shop_name))]

  await sendEmail(
    container,
    order.email,
    `Bank transfer received – order #${order.display_id}`,
    paragraph(
      `Yarnly has received your bank transfer. Your order has been sent to ${shops.map(escapeHtml).join(", ")}.`
    ) + link(`${STOREFRONT_URL}/account/orders/details/${order.order_id}`, "View order")
  )
}

export async function emailTransferSubmitted(
  container: MedusaContainer,
  order: { id: string; display_id: number; email: string }
) {
  const marketplace: MarketplaceModuleService = container.marketplace
  // Sub-orders the customer canceled meanwhile are not owed.
  const owed = (await marketplace.listSubOrders({ marketplace_order_id: order.id }))
    .filter((sub) => sub.status !== "canceled")
    .reduce((sum, sub) => sum + subOrderAmount(sub), 0)

  await notifyAdmin(
    container,
    `Customer reported a bank transfer – order #${order.display_id}`,
    paragraph(
      `Customer ${escapeHtml(order.email)} reported transferring <b>${formatVnd(owed)}</b> (items + shipping) for order #${order.display_id} (reference "YARNLY ${order.display_id}"). Please check your bank statement and confirm in Admin → Marketplace Orders.`
    )
  )
}

export async function emailSubOrderAccepted(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  const due = sub.due_date
    ? `${escapeHtml(sub.artisan.shop_name)} will finish before <b>${formatDate(sub.due_date)}</b>.`
    : `${escapeHtml(sub.artisan.shop_name)} is preparing your items for shipment.`

  await sendEmail(
    container,
    sub.marketplace_order.email,
    `${sub.artisan.shop_name} accepted order ${sub.code}`,
    paragraph(`${escapeHtml(sub.artisan.shop_name)} accepted order ${sub.code}. ${due}`) +
      orderLink(sub)
  )
}

export async function emailSubOrderCanceled(
  container: MedusaContainer,
  sub: FullSubOrder,
  notifyArtisan: boolean
) {
  const refund =
    sub.refund_status === "pending"
      ? paragraph(
          `The <b>${formatVnd(subOrderAmount(sub))}</b> (items + shipping) you transferred will be refunded by Yarnly to the originating account.`
        )
      : ""

  await sendEmail(
    container,
    sub.marketplace_order.email,
    `Order ${sub.code} was canceled`,
    paragraph(`Reason: ${escapeHtml(sub.cancel_reason)}`) +
      itemsTable(sub.items) +
      refund +
      orderLink(sub)
  )

  if (notifyArtisan) {
    await sendEmail(
      container,
      sub.artisan.email,
      `Order ${sub.code} was canceled`,
      paragraph(`Reason: ${escapeHtml(sub.cancel_reason)}`) + itemsTable(sub.items)
    )
  }

  if (sub.refund_status === "pending") {
    await notifyAdmin(
      container,
      `Refund required for order ${sub.code}`,
      paragraph(
        `Order ${sub.code} (customer ${escapeHtml(sub.marketplace_order.email)}) was canceled after payment. Refund <b>${formatVnd(subOrderAmount(sub))}</b> (items + shipping), then select "Mark refunded" in Admin → Marketplace Orders.`
      )
    )
  }
}

export async function emailReadyToShip(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  await notifyAdmin(
    container,
    `Order ${sub.code} is ready – shipment required`,
    paragraph(`Artisan <b>${escapeHtml(sub.artisan.shop_name)}</b> has finished order ${sub.code}.`) +
      "<h4>Pickup address</h4>" +
      paragraph(
        `${escapeHtml(sub.artisan.shop_name)} – ${escapeHtml(sub.artisan.phone)}<br/>${escapeHtml(sub.artisan.pickup_address)}`
      ) +
      "<h4>Delivery address</h4>" +
      paragraph(
        `${escapeHtml(sub.shipping_name)} – ${escapeHtml(sub.shipping_phone)}<br/>${escapeHtml(sub.shipping_address)}`
      ) +
      "<h4>Items</h4>" +
      itemsTable(sub.items) +
      paragraph(
        sub.shipping_charged === null || sub.shipping_charged === undefined
          ? "Order placed before checkout shipping fees: the recipient pays shipping to GHN" +
              (sub.marketplace_order.payment_method === "cod"
                ? `, collect COD <b>${formatVnd(sub.subtotal)}</b>.`
                : ".")
          : sub.marketplace_order.payment_method === "cod"
          ? `Collect COD: <b>${formatVnd(subOrderAmount(sub))}</b> (items + shipping paid by the customer). Yarnly pays GHN.`
          : "The customer prepaid items and shipping: collect nothing on delivery. Yarnly pays GHN."
      )
  )
}

export async function emailShipping(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  const tracking =
    sub.carrier === "GHN" && sub.tracking_number
      ? ` – <a href="https://donhang.ghn.vn/?order_code=${encodeURIComponent(sub.tracking_number)}">track shipment</a>`
      : ""
  const legacy = sub.shipping_charged === null || sub.shipping_charged === undefined
  const pay = legacy
    ? sub.marketplace_order.payment_method === "cod"
      ? `The carrier collects <b>${formatVnd(sub.subtotal)}</b> for items plus shipping on delivery.`
      : "Shipping is payable to the carrier on delivery."
    : sub.marketplace_order.payment_method === "cod"
      ? `Shipper thu <b>${formatVnd(subOrderAmount(sub))}</b> (items + shipping) on delivery.`
      : "You have paid for items and shipping. The carrier will not collect an additional payment."

  await sendEmail(
    container,
    sub.marketplace_order.email,
    `Order ${sub.code} is out for delivery`,
    paragraph(
      `Carrier: <b>${escapeHtml(sub.carrier)}</b><br/>Tracking number: <b>${escapeHtml(sub.tracking_number)}</b>${tracking}`
    ) +
      paragraph(pay) +
      orderLink(sub)
  )
}

export async function emailDelivered(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  await sendEmail(
    container,
    sub.marketplace_order.email,
    `Order ${sub.code} was delivered successfully`,
    paragraph(
      "Your order has been delivered. It will automatically complete after 2 days."
    ) + orderLink(sub)
  )
}

export async function emailCompleted(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  await sendEmail(
    container,
    sub.marketplace_order.email,
    `Order ${sub.code} is complete`,
    paragraph("Thank you for shopping handmade at Yarnly!") + orderLink(sub)
  )
  await sendEmail(
    container,
    sub.artisan.email,
    `Order ${sub.code} is complete`,
    paragraph(
      `Order ${sub.code} is complete. <b>${formatVnd(sub.subtotal)}</b> will be included in next Monday's payout.`
    )
  )
}

export async function emailRefunded(
  container: MedusaContainer,
  sub: FullSubOrder
) {
  await sendEmail(
    container,
    sub.marketplace_order.email,
    `Refunded order ${sub.code}`,
    paragraph(
      `Yarnly refunded <b>${formatVnd(subOrderAmount(sub))}</b> for order ${sub.code} to the account you paid from.`
    )
  )
}
