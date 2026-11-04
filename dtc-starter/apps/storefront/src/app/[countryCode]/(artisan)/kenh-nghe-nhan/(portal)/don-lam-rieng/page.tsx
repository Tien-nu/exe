import { listArtisanCustomRequests, listArtisanSubOrders } from "@lib/data/artisan-portal"
import type { ArtisanSubOrder, CustomRequest } from "@lib/marketplace-types"
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
  { key: "", label: "New requests", requests: ["pending"] },
  { key: "bao-gia", label: "Awaiting customer decision", requests: ["quoted", "accepted"] },
  { key: "dang-lam", label: "In progress", orders: ["processing"] },
  { key: "giao-hang", label: "Delivery", orders: ["ready_to_ship", "shipping", "delivered"] },
  { key: "hoan-thanh", label: "Completed", orders: ["completed"] },
  {
    key: "da-huy",
    label: "Canceled / declined",
    requests: ["artisan_declined", "customer_declined"],
    orders: ["canceled"],
  },
]

// The shared labels speak to the customer ("You declined"); these speak to the artisan.
const REQUEST_LABELS: Record<CustomRequest["status"], string> = {
  pending: "Awaiting your quote",
  quoted: "Quote sent",
  artisan_declined: "You declined",
  accepted: "Accepted — awaiting payment",
  customer_declined: "Customer declined",
  ordered: "Ordered",
}

const RequestCard = ({ request }: { request: CustomRequest }) => (
  <div className="rounded-2xl border border-yarnly-line bg-white p-4 small:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-yarnly text-lg tracking-[-0.01em]">{request.product_title}</p>
        <p className="txt-small text-yarnly-muted">
          {request.customer_name ?? "Customer"} · {formatDateTime(request.created_at)}
        </p>
      </div>
      <span className="rounded-full bg-yarnly-sage px-3 py-1 text-[12px] font-medium text-yarnly-moss-dark">
        {REQUEST_LABELS[request.status]}
      </span>
    </div>
    <p className="mt-3 txt-medium leading-relaxed">
      <span className="font-medium">{request.quantity} {request.quantity === 1 ? "item" : "items"}</span> · {request.description}
    </p>
    {(request.color || request.size) && (
      <p className="mt-1 txt-small text-yarnly-muted">
        {request.color && `Color: ${request.color}`}
        {request.color && request.size && " · "}
        {request.size && `Size: ${request.size}`}
      </p>
    )}
    {request.quoted_price !== null && (
      <p className="mt-3 border-t border-yarnly-line pt-3 txt-small">
        You quoted <strong>{formatVnd(request.quoted_price)}</strong>/item · {request.quoted_lead_days} days
        {request.status === "accepted" && " · the customer accepted and is completing payment"}
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
        eyebrow="Orders"
        title="Custom orders"
        description="You quote a price and production time once. If the customer accepts, they pay by bank transfer (shipping included) and the order moves to In progress. When it is finished, mark it Ready and Yarnly ships it like any other order."
      />
      <FilterTabs
        label="Filter custom orders"
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
          title="Nothing here yet"
          description="When a customer sends a custom request for one of your products, it appears under New requests."
        />
      )}
    </div>
  )
}
