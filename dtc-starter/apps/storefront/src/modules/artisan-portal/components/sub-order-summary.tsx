import type { ArtisanSubOrder } from "@lib/marketplace-types"
import { formatDate, formatDateTime } from "@lib/util/vn-format"

/** One line telling the artisan what happens next with this sub-order. */
export default function SubOrderNextStep({ subOrder }: { subOrder: ArtisanSubOrder }) {
  switch (subOrder.status) {
    case "pending_acceptance":
      return <>Acceptance deadline: <strong>{formatDateTime(subOrder.accept_deadline)}</strong> — the order is canceled automatically after this deadline.</>
    case "processing":
      return subOrder.due_date ? (
        <>Production deadline: <strong>{formatDate(subOrder.due_date)}</strong></>
      ) : (
        <>Prepare and pack the ready-made items.</>
      )
    case "ready_to_ship":
      return <>Yarnly notified at {formatDateTime(subOrder.ready_at)}. Awaiting carrier collection.</>
    case "shipping":
      return (
        <>
          {subOrder.carrier} –{" "}
          {subOrder.tracking_url ? (
            <a href={subOrder.tracking_url} target="_blank" rel="noreferrer" className="text-violet-700 underline">
              {subOrder.tracking_number}
            </a>
          ) : (
            subOrder.tracking_number
          )}
          {subOrder.carrier_status_label && ` · ${subOrder.carrier_status_label}`}
        </>
      )
    case "delivered":
      return <>Delivered; automatically completes at {formatDateTime(subOrder.complete_at)}.</>
    case "completed":
      return subOrder.payout_id ? <>Included in a payout period.</> : <>Will be included in next Monday's payout.</>
    case "canceled":
      return <>{subOrder.cancel_reason}</>
    default:
      return null
  }
}
