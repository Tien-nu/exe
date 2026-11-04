import { listArtisanPayouts } from "@lib/data/artisan-portal"
import { formatDate, formatDateTime, formatVnd } from "@lib/util/vn-format"
import { EmptyState, PageHeader } from "@modules/artisan-portal/ui"

export default async function ArtisanPayoutsPage() {
  const payouts = await listArtisanPayouts()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gian hàng"
        title="Thu nhập"
        description="Mỗi thứ Hai, Yarnly tổng hợp các đơn hoàn thành tuần trước và chuyển khoản vào tài khoản trong hồ sơ của bạn. Phí sàn hiện tại: 0%."
      />
      {payouts.length ? (
        <section className="overflow-hidden rounded-2xl border border-yarnly-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] txt-medium">
              <thead className="bg-yarnly-paper text-left txt-small text-yarnly-muted">
                <tr>
                  <th className="px-5 py-3 font-normal">Kỳ</th>
                  <th className="px-5 py-3 font-normal">Số đơn</th>
                  <th className="px-5 py-3 font-normal">Tiền hàng</th>
                  <th className="px-5 py-3 font-normal">Phí sàn</th>
                  <th className="px-5 py-3 font-normal">Thực nhận</th>
                  <th className="px-5 py-3 font-normal">Trạng thái</th>
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
                            Đã chuyển {formatDateTime(payout.paid_at)}
                          </span>
                          <span className="txt-small text-yarnly-muted">Mã GD: {payout.transaction_ref}</span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#f6ead0] px-2.5 py-0.5 text-[12px] font-medium text-[#7d5716]">
                          Chờ Yarnly chuyển
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
          title="Chưa có kỳ chuyển tiền nào"
          description="Khi có đơn hoàn thành, Yarnly sẽ tổng hợp và chuyển tiền cho bạn vào thứ Hai kế tiếp."
        />
      )}
    </div>
  )
}
