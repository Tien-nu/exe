import type { ArtisanSubOrder } from "@lib/marketplace-types"
import { formatDate, formatDateTime } from "@lib/util/vn-format"
import { linkClass } from "../ui"

/** One line telling the artisan what happens next with this sub-order. */
export default function SubOrderNextStep({ subOrder }: { subOrder: ArtisanSubOrder }) {
  switch (subOrder.status) {
    case "pending_acceptance":
      return <>Hạn xác nhận: <strong>{formatDateTime(subOrder.accept_deadline)}</strong> – quá hạn đơn tự huỷ.</>
    case "processing":
      return subOrder.due_date ? (
        <>Hạn làm xong: <strong>{formatDate(subOrder.due_date)}</strong></>
      ) : (
        <>Chuẩn bị và đóng gói hàng có sẵn.</>
      )
    case "ready_to_ship":
      return <>Đã báo Yarnly lúc {formatDateTime(subOrder.ready_at)}. Chờ đơn vị vận chuyển tới lấy.</>
    case "shipping":
      return (
        <>
          {subOrder.carrier} –{" "}
          {subOrder.tracking_url ? (
            <a href={subOrder.tracking_url} target="_blank" rel="noreferrer" className={linkClass}>
              {subOrder.tracking_number}
            </a>
          ) : (
            subOrder.tracking_number
          )}
          {subOrder.carrier_status_label && ` · ${subOrder.carrier_status_label}`}
        </>
      )
    case "delivered":
      return <>Đã giao, tự hoàn thành lúc {formatDateTime(subOrder.complete_at)}.</>
    case "completed":
      return subOrder.payout_id ? <>Đã vào kỳ chuyển tiền.</> : <>Sẽ vào kỳ chuyển tiền thứ Hai tới.</>
    case "canceled":
      return <>{subOrder.cancel_reason}</>
    default:
      return null
  }
}
