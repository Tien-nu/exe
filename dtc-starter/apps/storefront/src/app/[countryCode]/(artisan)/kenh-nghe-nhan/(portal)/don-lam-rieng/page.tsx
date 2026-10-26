import { listArtisanCustomRequests, listArtisanSubOrders } from "@lib/data/artisan-portal"
import {
  CUSTOM_REQUEST_LABELS,
  type ArtisanSubOrder,
  type CustomRequest,
} from "@lib/marketplace-types"
import { formatDateTime, formatVnd } from "@lib/util/vn-format"
import RespondCustomRequest from "@modules/artisan-portal/components/respond-custom-request"
import SubOrderCard from "@modules/artisan-portal/components/sub-order-card"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"

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

const RequestCard = ({ request }: { request: CustomRequest }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="txt-medium-plus">{request.product_title}</p>
        <p className="txt-small text-ui-fg-subtle">
          {request.customer_name ?? "Customer"} · {formatDateTime(request.created_at)}
        </p>
      </div>
      <span className="rounded-full bg-gray-100 px-3 py-1 txt-small-plus">
        {CUSTOM_REQUEST_LABELS[request.status]}
      </span>
    </div>
    <p className="mt-2 txt-medium">
      {request.quantity} items · {request.description}
    </p>
    {(request.color || request.size) && (
      <p className="txt-small text-ui-fg-subtle">
        {request.color && `Color: ${request.color}`}
        {request.color && request.size && " · "}
        {request.size && `Size: ${request.size}`}
      </p>
    )}
    {request.quoted_price !== null && (
      <p className="mt-2 txt-small">
        Your quote {formatVnd(request.quoted_price)}/item · {request.quoted_lead_days} days
        {request.status === "accepted" && " · accepted by the customer, awaiting payment"}
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl-semi">Custom orders</h1>
        <p className="txt-small text-ui-fg-subtle">
          Send one quote with a price and production time. Once the customer accepts and pays by bank transfer, including regional shipping, the order moves to In progress. Mark it Ready when finished so Yarnly can arrange delivery.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = (({ requests, orders }) => requests.length + orders.length)(inTab(t))

          return (
            <LocalizedClientLink
              key={t.key}
              href={`/kenh-nghe-nhan/don-lam-rieng${t.key ? `?tab=${t.key}` : ""}`}
              className={clx(
                "rounded-full border px-3 py-1 txt-small",
                t.key === current.key
                  ? "border-violet-300 bg-violet-100 text-violet-800"
                  : "border-gray-200 bg-white"
              )}
            >
              {t.label}
              {count > 0 && ` (${count})`}
            </LocalizedClientLink>
          )
        })}
      </div>
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
        <p className="txt-medium text-ui-fg-subtle">Nothing here yet.</p>
      )}
    </div>
  )
}
