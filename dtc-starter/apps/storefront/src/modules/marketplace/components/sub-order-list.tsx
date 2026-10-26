"use client"

import { cancelSubOrder } from "@lib/data/marketplace"
import type { CustomerSubOrder } from "@lib/marketplace-types"
import {
  SUB_ORDER_BADGE,
  formatDate,
  formatDateTime,
  formatVnd,
} from "@lib/util/vn-format"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@modules/common/components/ui"
import { useRouter } from "next/navigation"
import { useFeedback } from "@modules/common/components/feedback"
import { useTransition } from "react"

const Hint = ({ subOrder }: { subOrder: CustomerSubOrder }) => {
  // The shop this part of the order comes from.
  const shop = subOrder.artisan?.shop_name ?? "Shop"

  switch (subOrder.status) {
    case "pending_payment":
      return <>Awaiting your bank transfer.</>
    case "pending_acceptance":
      return <>{shop} will confirm before {formatDateTime(subOrder.accept_deadline)}.</>
    case "processing":
      return subOrder.due_date ? (
        <>{shop} is making your order, due before {formatDate(subOrder.due_date)}.</>
      ) : (
        <>{shop} is preparing your items.</>
      )
    case "ready_to_ship":
      return <>Production complete. Yarnly is arranging shipment.</>
    case "shipping":
      return (
        <>
          {subOrder.carrier} – tracking number{" "}
          {subOrder.tracking_url ? (
            <a href={subOrder.tracking_url} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 underline">
              {subOrder.tracking_number}
            </a>
          ) : (
            <strong>{subOrder.tracking_number}</strong>
          )}
          {subOrder.carrier_status_label && ` · ${subOrder.carrier_status_label}`}
          {subOrder.expected_delivery_at && ` · estimated delivery ${formatDate(subOrder.expected_delivery_at)}`}
          {"."}
        </>
      )
    case "delivered":
      return <>Delivered at {formatDateTime(subOrder.delivered_at)}, automatically completed after 2 days.</>
    case "completed":
      return <>Completed. Thank you!</>
    case "canceled":
      return (
        <>
          {subOrder.cancel_reason}
          {subOrder.refund_status === "pending" && " · Yarnly will refund you."}
          {subOrder.refund_status === "refunded" && " · Refunded."}
        </>
      )
    default:
      return null
  }
}

const SubOrderCard = ({ subOrder }: { subOrder: CustomerSubOrder }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { confirm, toast } = useFeedback()
  const canCancel = ["pending_payment", "pending_acceptance"].includes(subOrder.status)

  return (
    <div className="rounded-md border border-gray-200 p-4" data-testid="sub-order">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="txt-medium-plus">
            Order {subOrder.code}
            {subOrder.artisan && (
              <>
                {" · "}
                <LocalizedClientLink
                  href={`/nghe-nhan/${subOrder.artisan.handle}`}
                  className="text-violet-700 hover:underline"
                >
                  {subOrder.artisan.shop_name}
                </LocalizedClientLink>
              </>
            )}
          </p>
          {subOrder.is_custom && (
            <p className="txt-small text-violet-700">Custom made</p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 txt-small-plus ${SUB_ORDER_BADGE[subOrder.status]}`}
        >
          {subOrder.status === "pending_acceptance"
            ? `Waiting for ${subOrder.artisan?.shop_name ?? "shop"} confirmed`
            : subOrder.status_label}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1 txt-medium">
        {subOrder.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span>
              {item.quantity} × {item.title}
              {item.variant_title && (
                <span className="text-ui-fg-subtle"> ({item.variant_title})</span>
              )}
            </span>
            <span>{formatVnd(item.total)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex justify-between gap-4 txt-medium text-ui-fg-subtle">
        <span>Shipping fee</span>
        <span>
          {subOrder.shipping_charged === null
            ? "Pay the carrier on delivery"
            : formatVnd(subOrder.shipping_charged)}
        </span>
      </p>
      <p className="mt-3 txt-small text-ui-fg-subtle">
        <Hint subOrder={subOrder} />
      </p>
      {canCancel && (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="small"
            isLoading={pending}
            onClick={async () => {
              const ok = await confirm({
                title: `Cancel order ${subOrder.code}?`,
                description: subOrder.artisan
                  ? `Items from ${subOrder.artisan.shop_name} will be canceled. Other parts of the order will remain unchanged.`
                  : undefined,
                confirmText: "Cancel order",
                cancelText: "Keep order",
                tone: "danger",
              })
              if (!ok) return
              startTransition(async () => {
                const result = await cancelSubOrder(subOrder.id)
                if (result.error) toast.error(result.error)
                else toast.success(`Canceled order ${subOrder.code}`)
                router.refresh()
              })
            }}
          >
            Cancel this order
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SubOrderList({ subOrders }: { subOrders: CustomerSubOrder[] }) {
  return (
    <div className="flex flex-col gap-3">
      {subOrders.map((subOrder) => (
        <SubOrderCard key={subOrder.id} subOrder={subOrder} />
      ))}
    </div>
  )
}
