import type { ArtisanSubOrder } from "@lib/marketplace-types"
import { formatDateTime, formatVnd } from "@lib/util/vn-format"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { StatusBadge } from "../ui"
import SubOrderNextStep from "./sub-order-summary"

/** One sub-order in the portal's lists; opens its detail page. */
export default function SubOrderCard({ subOrder }: { subOrder: ArtisanSubOrder }) {
  return (
    <LocalizedClientLink
      href={`/kenh-nghe-nhan/don-hang/${subOrder.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-yarnly-line bg-white p-4 transition-[border-color,box-shadow] hover:border-yarnly-ink hover:shadow-[0_6px_20px_-12px_#33362f40] small:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-yarnly text-lg tracking-[-0.01em]">Đơn {subOrder.code}</span>
          {subOrder.is_custom && (
            <span className="rounded-full bg-yarnly-sage px-2 py-0.5 text-[11px] font-medium text-yarnly-moss">
              Làm riêng
            </span>
          )}
        </span>
        <StatusBadge status={subOrder.status} label={subOrder.status_label} />
      </div>
      <p className="txt-medium">
        {subOrder.items.map((item) => `${item.quantity} × ${item.title}`).join(", ")}
      </p>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-yarnly-line pt-3 txt-small text-yarnly-muted">
        <span>
          <SubOrderNextStep subOrder={subOrder} />
        </span>
        <span>
          <span className="font-medium text-yarnly-ink">{formatVnd(subOrder.subtotal)}</span> ·{" "}
          {subOrder.payment_method === "cod" ? "COD" : "Đã chuyển khoản"} ·{" "}
          {formatDateTime(subOrder.created_at)}
        </span>
      </div>
    </LocalizedClientLink>
  )
}
