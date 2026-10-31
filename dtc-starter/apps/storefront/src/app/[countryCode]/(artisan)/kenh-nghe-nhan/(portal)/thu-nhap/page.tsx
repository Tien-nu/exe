import { listArtisanPayouts } from "@lib/data/artisan-portal"
import { formatDate, formatDateTime, formatVnd } from "@lib/util/vn-format"
import { EmptyState, PageHeader } from "@modules/artisan-portal/ui"

export default async function ArtisanPayoutsPage() {
  const payouts = await listArtisanPayouts()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Shop"
        title="Earnings"
        description="Every Monday, Yarnly totals the previous week's completed orders and transfers your earnings to the bank account in your profile. Current platform fee: 0%."
      />
      {payouts.length ? (
        <section className="overflow-hidden rounded-2xl border border-yarnly-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] txt-medium">
              <thead className="bg-yarnly-paper text-left txt-small text-yarnly-muted">
                <tr>
                  <th className="px-5 py-3 font-normal">Period</th>
                  <th className="px-5 py-3 font-normal">Orders</th>
                  <th className="px-5 py-3 font-normal">Item total</th>
                  <th className="px-5 py-3 font-normal">Platform fee</th>
                  <th className="px-5 py-3 font-normal">Net payout</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id} className="border-t border-yarnly-line align-top">
                    <td className="whitespace-nowrap px-5 py-4">
                      {formatDate(payout.period_start)} – {formatDate(payout.period_end)}
                    </td>
                    <td className="px-5 py-4">{payout.sub_order_count}</td>
                    <td className="whitespace-nowrap px-5 py-4">{formatVnd(payout.gross_amount)}</td>
                    <td className="px-5 py-4">{payout.fee_percent}%</td>
                    <td className="whitespace-nowrap px-5 py-4 font-yarnly text-lg tracking-[-0.01em]">
                      {formatVnd(payout.net_amount)}
                    </td>
                    <td className="px-5 py-4">
                      {payout.status === "paid" ? (
                        <span className="flex flex-col gap-1">
                          <span className="w-fit rounded-full bg-yarnly-sage px-2.5 py-0.5 text-[12px] font-medium text-yarnly-moss-dark">
                            Paid {formatDateTime(payout.paid_at)}
                          </span>
                          <span className="txt-small text-yarnly-muted">Transaction ref: {payout.transaction_ref}</span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#f6ead0] px-2.5 py-0.5 text-[12px] font-medium text-[#7d5716]">
                          Awaiting payment from Yarnly
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No payouts yet"
          description="Once orders are completed, Yarnly totals them and pays you the following Monday."
        />
      )}
    </div>
  )
}
