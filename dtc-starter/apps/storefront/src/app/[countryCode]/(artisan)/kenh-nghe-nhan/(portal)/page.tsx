import { getArtisanDashboard } from "@lib/data/artisan-portal"
import { formatVnd } from "@lib/util/vn-format"
import { Card } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const TODO = [
  { status: "pending_acceptance", label: "Orders awaiting your acceptance", hint: "Accept or decline within 12 hours" },
  { status: "processing", label: "Orders in production / preparation", hint: "Mark the order Ready when it is finished" },
  { status: "ready_to_ship", label: "Awaiting shipment from Yarnly", hint: "The carrier will collect your package" },
  { status: "shipping", label: "Shipping", hint: "" },
] as const

export default async function ArtisanDashboardPage() {
  const dashboard = await getArtisanDashboard()

  if (!dashboard) {
    return null
  }

  const counts = dashboard.sub_orders_by_status

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl-semi">Overview</h1>
      <div className="grid grid-cols-2 gap-4 medium:grid-cols-4">
        {TODO.map((item) => (
          <LocalizedClientLink
            key={item.status}
            href={`/kenh-nghe-nhan/don-hang?status=${item.status}`}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-violet-300"
          >
            <p className="text-3xl font-semibold">{counts[item.status] ?? 0}</p>
            <p className="txt-medium-plus">{item.label}</p>
            {item.hint && <p className="txt-small text-ui-fg-subtle">{item.hint}</p>}
          </LocalizedClientLink>
        ))}
      </div>
      {dashboard.pending_custom_requests > 0 && (
        <LocalizedClientLink
          href="/kenh-nghe-nhan/don-lam-rieng"
          className="rounded-lg border border-violet-200 bg-violet-50 p-4 txt-medium"
        >
          You have <strong>{dashboard.pending_custom_requests}</strong> custom requests awaiting a quote →
        </LocalizedClientLink>
      )}
      <Card title="Earnings">
        <dl className="grid grid-cols-2 gap-4 medium:grid-cols-4">
          <div>
            <dt className="txt-small text-ui-fg-subtle">Completed orders</dt>
            <dd className="txt-xlarge-plus">{formatVnd(dashboard.revenue.completed_total)}</dd>
          </div>
          <div>
            <dt className="txt-small text-ui-fg-subtle">Awaiting the next payout summary (Monday)</dt>
            <dd className="txt-xlarge-plus">{formatVnd(dashboard.revenue.awaiting_payout)}</dd>
          </div>
          <div>
            <dt className="txt-small text-ui-fg-subtle">Awaiting payment from Yarnly</dt>
            <dd className="txt-xlarge-plus">{formatVnd(dashboard.revenue.pending_payout)}</dd>
          </div>
          <div>
            <dt className="txt-small text-ui-fg-subtle">Paid out</dt>
            <dd className="txt-xlarge-plus">{formatVnd(dashboard.revenue.paid_out)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
