import { listArtisanSubOrders } from "@lib/data/artisan-portal"
import SubOrderCard from "@modules/artisan-portal/components/sub-order-card"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"

const TABS = [
  { status: "", label: "All" },
  { status: "pending_acceptance", label: "Awaiting acceptance" },
  { status: "processing", label: "In progress" },
  { status: "ready_to_ship", label: "Ready to ship" },
  { status: "shipping", label: "Shipping" },
  { status: "completed", label: "Completed" },
  { status: "canceled", label: "Canceled" },
]

/** Orders for listed products; custom-made ones live in "Đơn làm riêng". */
export default async function ArtisanOrdersPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status = "" } = await props.searchParams
  const subOrders = await listArtisanSubOrders(status || undefined, false)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl-semi">Ready-made orders</h1>
        <p className="txt-small text-ui-fg-subtle">
          Orders for listed products. For custom requests, see{" "}
          <LocalizedClientLink href="/kenh-nghe-nhan/don-lam-rieng" className="text-violet-700 underline">
            Custom orders
          </LocalizedClientLink>
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <LocalizedClientLink
            key={tab.status}
            href={`/kenh-nghe-nhan/don-hang${tab.status ? `?status=${tab.status}` : ""}`}
            className={clx(
              "rounded-full border px-3 py-1 txt-small",
              tab.status === status
                ? "border-violet-300 bg-violet-100 text-violet-800"
                : "border-gray-200 bg-white"
            )}
          >
            {tab.label}
          </LocalizedClientLink>
        ))}
      </div>
      {subOrders.length ? (
        <ul className="flex flex-col gap-3">
          {subOrders.map((subOrder) => (
            <li key={subOrder.id}>
              <SubOrderCard subOrder={subOrder} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="txt-medium text-ui-fg-subtle">No orders found.</p>
      )}
    </div>
  )
}
