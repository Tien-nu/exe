import type { ArtisanSubOrder } from "@lib/marketplace-types"
import { SUB_ORDER_BADGE, formatDateTime, formatVnd } from "@lib/util/vn-format"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SubOrderNextStep from "./sub-order-summary"

/** One sub-order in the portal's lists; opens its detail page. */
export default function SubOrderCard({ subOrder }: { subOrder: ArtisanSubOrder }) {
  return (
    <LocalizedClientLink
      href={`/kenh-nghe-nhan/don-hang/${subOrder.id}`}
      className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 hover:border-violet-300"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="txt-medium-plus">
          Order {subOrder.code}
          {subOrder.is_custom && (
            <span className="ml-2 txt-small text-violet-700">Custom-made</span>
          )}
        </span>
        <span className={`rounded-full px-3 py-1 txt-small-plus ${SUB_ORDER_BADGE[subOrder.status]}`}>
          {subOrder.status_label}
        </span>
      </div>
      <p className="txt-medium">
        {subOrder.items.map((item) => `${item.quantity} × ${item.title}`).join(", ")}
      </p>
      <div className="flex flex-wrap justify-between gap-2 txt-small text-ui-fg-subtle">
        <span>
          <SubOrderNextStep subOrder={subOrder} />
        </span>
        <span>
          {formatVnd(subOrder.subtotal)} ·{" "}
          {subOrder.payment_method === "cod" ? "COD" : "Paid by bank transfer"} ·{" "}
          {formatDateTime(subOrder.created_at)}
        </span>
      </div>
    </LocalizedClientLink>
  )
}
