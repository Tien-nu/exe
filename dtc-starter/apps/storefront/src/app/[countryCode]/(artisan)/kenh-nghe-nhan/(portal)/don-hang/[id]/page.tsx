import { getArtisanSubOrder } from "@lib/data/artisan-portal"
import { SUB_ORDER_BADGE, formatDateTime, formatVnd } from "@lib/util/vn-format"
import SubOrderActions from "@modules/artisan-portal/components/sub-order-actions"
import SubOrderNextStep from "@modules/artisan-portal/components/sub-order-summary"
import { Card } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { notFound } from "next/navigation"

export default async function ArtisanOrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const subOrder = await getArtisanSubOrder(id)

  if (!subOrder) {
    notFound()
  }

  const timeline = [
    ["Order placed", subOrder.created_at],
    ["Accepted", subOrder.accepted_at],
    ["Ready", subOrder.ready_at],
    ["Handed to carrier", subOrder.shipped_at],
    ["Delivered", subOrder.delivered_at],
    ["Completed", subOrder.completed_at],
    ["Cancel", subOrder.canceled_at],
  ].filter(([, date]) => date) as [string, string][]

  return (
    <div className="flex flex-col gap-4">
      <LocalizedClientLink href="/kenh-nghe-nhan/don-hang" className="txt-small text-ui-fg-subtle">
        ← Orders
      </LocalizedClientLink>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl-semi">Order {subOrder.code}</h1>
        <span className={`rounded-full px-3 py-1 txt-small-plus ${SUB_ORDER_BADGE[subOrder.status]}`}>
          {subOrder.status_label}
        </span>
      </div>
      <p className="txt-medium">
        <SubOrderNextStep subOrder={subOrder} />
      </p>
      <SubOrderActions subOrder={subOrder} />

      {subOrder.custom_request && (
        <Card title="Agreed custom order details">
          <p className="txt-medium">{subOrder.custom_request.description}</p>
          <p className="txt-small text-ui-fg-subtle">
            {subOrder.custom_request.color && `Color: ${subOrder.custom_request.color} · `}
            {subOrder.custom_request.size && `Size: ${subOrder.custom_request.size} · `}
            Quoted price {formatVnd(subOrder.custom_request.quoted_price)}/item · {subOrder.custom_request.quoted_lead_days} days
          </p>
        </Card>
      )}

      <Card title="Products">
        <ul className="flex flex-col gap-3">
          {subOrder.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              {item.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnail} alt="" className="h-14 w-14 rounded-md object-cover" />
              )}
              <div className="flex-1">
                <p className="txt-medium-plus">{item.title}</p>
                <p className="txt-small text-ui-fg-subtle">
                  {item.variant_title} · {item.made_to_order ? "Made to order" : "Ready to ship"}
                </p>
              </div>
              <p className="txt-medium">
                {item.quantity} × {formatVnd(item.unit_price)}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-right txt-medium-plus">Items: {formatVnd(subOrder.subtotal)}</p>
        <p className="text-right txt-small text-ui-fg-subtle">
          {subOrder.payment_method === "cod"
            ? "Customer pays on delivery (COD)"
            : "Customer has paid Yarnly by bank transfer"}{" "}
          · Yarnly pays you on the Monday after the order is completed
        </p>
      </Card>

      <Card title="History">
        <ul className="flex flex-col gap-1 txt-medium">
          {timeline.map(([label, date]) => (
            <li key={label} className="flex justify-between">
              <span>{label}</span>
              <span className="text-ui-fg-subtle">{formatDateTime(date)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
