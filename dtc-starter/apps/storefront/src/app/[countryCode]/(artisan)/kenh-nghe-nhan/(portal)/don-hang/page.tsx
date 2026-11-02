import { listArtisanSubOrders } from "@lib/data/artisan-portal"
import SubOrderCard from "@modules/artisan-portal/components/sub-order-card"
import { EmptyState, FilterTabs, PageHeader, linkClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const TABS = [
  { status: "", label: "All" },
  { status: "pending_acceptance", label: "Awaiting acceptance" },
  { status: "processing", label: "In progress" },
  { status: "ready_to_ship", label: "Awaiting shipment" },
  { status: "shipping", label: "Shipping" },
  { status: "completed", label: "Completed" },
  { status: "canceled", label: "Canceled" },
]

/** Orders for listed products; custom-made ones live in "Custom orders". */
export default async function ArtisanOrdersPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status = "" } = await props.searchParams
  const subOrders = await listArtisanSubOrders(status || undefined, false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Orders"
        title="Ready-made orders"
        description={
          <>
            Orders for the products you list. Orders made to a customer's request are under{" "}
            <LocalizedClientLink href="/kenh-nghe-nhan/don-lam-rieng" className={linkClass}>
              Custom orders
            </LocalizedClientLink>
            .
          </>
        }
      />
      <FilterTabs
        label="Filter by status"
        tabs={TABS.map((tab) => ({
          href: `/kenh-nghe-nhan/don-hang${tab.status ? `?status=${tab.status}` : ""}`,
          label: tab.label,
          active: tab.status === status,
        }))}
      />
      {subOrders.length ? (
        <ul className="flex flex-col gap-3">
          {subOrders.map((subOrder) => (
            <li key={subOrder.id}>
              <SubOrderCard subOrder={subOrder} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No orders here"
          description="New orders appear here as soon as a customer buys one of your products."
        />
      )}
    </div>
  )
}
