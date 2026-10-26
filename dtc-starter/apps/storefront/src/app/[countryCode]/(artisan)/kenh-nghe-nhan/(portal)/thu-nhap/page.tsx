import { listArtisanPayouts } from "@lib/data/artisan-portal"
import { formatDate, formatDateTime, formatVnd } from "@lib/util/vn-format"
import { Card } from "@modules/artisan-portal/ui"

export default async function ArtisanPayoutsPage() {
  const payouts = await listArtisanPayouts()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl-semi">Earnings</h1>
      <p className="txt-medium text-ui-fg-subtle">
        Every Monday, Yarnly summarizes the previous week's completed orders and transfers your earnings to the bank account in your profile. Current platform fee: 0%.
      </p>
      <Card>
        {payouts.length ? (
          <table className="w-full txt-medium">
            <thead className="text-left txt-small text-ui-fg-subtle">
              <tr>
                <th className="py-2">Period</th>
                <th>Orders</th>
                <th>Item total</th>
                <th>Platform fee</th>
                <th>Net earnings</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-t border-gray-100">
                  <td className="py-2">
                    {formatDate(payout.period_start)} – {formatDate(payout.period_end)}
                  </td>
                  <td>{payout.sub_order_count}</td>
                  <td>{formatVnd(payout.gross_amount)}</td>
                  <td>{payout.fee_percent}%</td>
                  <td className="font-semibold">{formatVnd(payout.net_amount)}</td>
                  <td>
                    {payout.status === "paid" ? (
                      <span className="text-emerald-700">
                        Paid {formatDateTime(payout.paid_at)}
                        <br />
                        <span className="txt-small text-ui-fg-subtle">Transaction reference: {payout.transaction_ref}</span>
                      </span>
                    ) : (
                      <span className="text-amber-700">Awaiting payment from Yarnly</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="txt-medium text-ui-fg-subtle">No payouts yet.</p>
        )}
      </Card>
    </div>
  )
}
