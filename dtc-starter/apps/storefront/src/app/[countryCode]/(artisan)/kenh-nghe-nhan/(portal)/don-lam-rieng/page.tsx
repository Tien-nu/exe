import { listArtisanCustomRequests, listArtisanSubOrders } from "@lib/data/artisan-portal"
import {
  CUSTOM_REQUEST_LABELS,
  type ArtisanSubOrder,
  type CustomRequest,
} from "@lib/marketplace-types"
import { formatDateTime, formatVnd } from "@lib/util/vn-format"
import RespondCustomRequest from "@modules/artisan-portal/components/respond-custom-request"
import SubOrderCard from "@modules/artisan-portal/components/sub-order-card"
import { EmptyState, FilterTabs, PageHeader } from "@modules/artisan-portal/ui"

/**
 * Everything custom-made in one place: requests to quote, quotes waiting on
 * the customer, then the orders, which are made and shipped like any other.
 */
const TABS: {
  key: string
  label: string
  requests?: CustomRequest["status"][]
  orders?: ArtisanSubOrder["status"][]
}[] = [
  { key: "", label: "Yêu cầu mới", requests: ["pending"] },
  { key: "bao-gia", label: "Chờ khách quyết định", requests: ["quoted", "accepted"] },
  { key: "dang-lam", label: "Đang làm", orders: ["processing"] },
  { key: "giao-hang", label: "Giao hàng", orders: ["ready_to_ship", "shipping", "delivered"] },
  { key: "hoan-thanh", label: "Hoàn thành", orders: ["completed"] },
  {
    key: "da-huy",
    label: "Đã huỷ / từ chối",
    requests: ["artisan_declined", "customer_declined"],
    orders: ["canceled"],
  },
]

const RequestCard = ({ request }: { request: CustomRequest }) => (
  <div className="rounded-2xl border border-yarnly-line bg-white p-4 small:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-yarnly text-lg tracking-[-0.01em]">{request.product_title}</p>
        <p className="txt-small text-yarnly-muted">
          {request.customer_name ?? "Khách hàng"} · {formatDateTime(request.created_at)}
        </p>
      </div>
      <span className="rounded-full bg-yarnly-sage px-3 py-1 text-[12px] font-medium text-yarnly-moss-dark">
        {CUSTOM_REQUEST_LABELS[request.status]}
      </span>
    </div>
    <p className="mt-3 txt-medium leading-relaxed">
      <span className="font-medium">{request.quantity} cái</span> · {request.description}
    </p>
    {(request.color || request.size) && (
      <p className="mt-1 txt-small text-yarnly-muted">
        {request.color && `Màu: ${request.color}`}
        {request.color && request.size && " · "}
        {request.size && `Kích thước: ${request.size}`}
      </p>
    )}
    {request.quoted_price !== null && (
      <p className="mt-3 border-t border-yarnly-line pt-3 txt-small">
        Bạn đã báo <strong>{formatVnd(request.quoted_price)}</strong>/cái · {request.quoted_lead_days} ngày
        {request.status === "accepted" && " · khách đã đồng ý, đang chờ khách thanh toán"}
      </p>
    )}
    {request.status === "pending" && <RespondCustomRequest requestId={request.id} />}
  </div>
)

export default async function ArtisanCustomOrdersPage(props: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab = "" } = await props.searchParams
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]

  // Both lists in one go: tab counters need all of them anyway.
  const [requests, subOrders] = await Promise.all([
    listArtisanCustomRequests(),
    listArtisanSubOrders(undefined, true),
  ])

  const inTab = (t: (typeof TABS)[number]) => ({
    requests: requests.filter((r) => t.requests?.includes(r.status)),
    orders: subOrders.filter((s) => t.orders?.includes(s.status)),
  })
  const shown = inTab(current)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Đơn hàng"
        title="Đơn làm riêng"
        description="Bạn báo giá và số ngày làm một lần. Khách đồng ý thì thanh toán chuyển khoản (kèm phí ship GHN), đơn vào mục Đang làm; làm xong bấm “Đã làm xong” để Yarnly giao hàng như đơn thường."
      />
      <FilterTabs
        label="Lọc đơn làm riêng"
        tabs={TABS.map((t) => {
          const { requests, orders } = inTab(t)

          return {
            href: `/kenh-nghe-nhan/don-lam-rieng${t.key ? `?tab=${t.key}` : ""}`,
            label: t.label,
            active: t.key === current.key,
            count: requests.length + orders.length,
          }
        })}
      />
      {shown.requests.length || shown.orders.length ? (
        <ul className="flex flex-col gap-3">
          {shown.orders.map((subOrder) => (
            <li key={subOrder.id}>
              <SubOrderCard subOrder={subOrder} />
            </li>
          ))}
          {shown.requests.map((request) => (
            <li key={request.id}>
              <RequestCard request={request} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Không có gì ở mục này"
          description="Khi khách gửi yêu cầu làm riêng cho sản phẩm của bạn, yêu cầu sẽ hiện ở “Yêu cầu mới”."
        />
      )}
    </div>
  )
}
