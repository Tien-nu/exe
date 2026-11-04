import { getArtisanDashboard } from "@lib/data/artisan-portal"
import { formatVnd } from "@lib/util/vn-format"
import { ArrowRightMini } from "@medusajs/icons"
import { Card, PageHeader, linkClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
import PixelIcon from "@modules/landing/components/pixel-icon"

const TODO = [
  { status: "pending_acceptance", label: "Đơn chờ bạn xác nhận", hint: "Nhận hoặc từ chối trong 12 tiếng" },
  { status: "processing", label: "Đơn đang làm / chuẩn bị", hint: "Làm xong thì bấm “Đã làm xong”" },
  { status: "ready_to_ship", label: "Chờ Yarnly tạo vận đơn", hint: "Đơn vị vận chuyển sẽ tới lấy hàng" },
  { status: "shipping", label: "Đang giao", hint: "Theo dõi mã vận đơn trong từng đơn" },
] as const

const REVENUE = [
  { key: "completed_total", label: "Đơn hoàn thành" },
  { key: "awaiting_payout", label: "Chờ tổng hợp (thứ Hai tới)" },
  { key: "pending_payout", label: "Chờ Yarnly chuyển" },
  { key: "paid_out", label: "Đã nhận" },
] as const

export default async function ArtisanDashboardPage() {
  const dashboard = await getArtisanDashboard()

  if (!dashboard) {
    return null
  }

  const counts = dashboard.sub_orders_by_status

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Xưởng của bạn hôm nay"
        title="Tổng quan"
        description="Việc cần làm với các đơn đang mở và tiền hàng của gian hàng."
      />

      <section aria-label="Việc cần làm" className="grid grid-cols-2 gap-3 small:gap-4 medium:grid-cols-4">
        {TODO.map((item) => {
          const count = counts[item.status] ?? 0
          const urgent = item.status === "pending_acceptance" && count > 0

          return (
            <LocalizedClientLink
              key={item.status}
              href={`/kenh-nghe-nhan/don-hang?status=${item.status}`}
              className={clx(
                "group flex flex-col gap-1 rounded-2xl border p-4 transition-[border-color,transform] hover:-translate-y-0.5 small:p-5",
                urgent
                  ? "border-[#ecd9a8] bg-[#fbf3df] hover:border-[#d9b96a]"
                  : "border-yarnly-line bg-white hover:border-yarnly-ink"
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-yarnly text-[40px] leading-none tracking-[-0.04em]">
                  {count}
                </span>
                {urgent && (
                  <span className="rounded-full bg-[#7d5716] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white">
                    Cần xử lý
                  </span>
                )}
              </span>
              <span className="mt-2 txt-medium-plus leading-snug">{item.label}</span>
              <span className="txt-small text-yarnly-muted">{item.hint}</span>
              <span className="mt-auto inline-flex items-center gap-0.5 pt-3 txt-small text-yarnly-moss">
                Xem đơn
                <ArrowRightMini className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </LocalizedClientLink>
          )
        })}
      </section>

      {dashboard.pending_custom_requests > 0 && (
        <LocalizedClientLink
          href="/kenh-nghe-nhan/don-lam-rieng"
          className="group flex items-center gap-4 rounded-2xl border border-[#d5ddc6] bg-yarnly-sage/70 p-4 transition-colors hover:border-yarnly-moss small:p-5"
        >
          <PixelIcon kind="gift" className="h-10 w-10 shrink-0" />
          <span className="flex-1 txt-medium">
            Bạn có <strong>{dashboard.pending_custom_requests}</strong> yêu cầu làm riêng chờ báo giá
          </span>
          <ArrowRightMini className="shrink-0 text-yarnly-moss transition-transform group-hover:translate-x-0.5" />
        </LocalizedClientLink>
      )}

      <Card
        title="Thu nhập"
        actions={
          <LocalizedClientLink href="/kenh-nghe-nhan/thu-nhap" className={clx("txt-small", linkClass)}>
            Xem các kỳ chuyển tiền
          </LocalizedClientLink>
        }
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 medium:grid-cols-4 medium:divide-x medium:divide-yarnly-line">
          {REVENUE.map((item, index) => (
            <div key={item.key} className={clx("flex flex-col gap-1", index > 0 && "medium:pl-6")}>
              <dt className="txt-small text-yarnly-muted">{item.label}</dt>
              <dd
                className={clx(
                  "font-yarnly text-[24px] leading-tight tracking-[-0.02em]",
                  item.key === "paid_out" && "text-yarnly-moss"
                )}
              >
                {formatVnd(dashboard.revenue[item.key])}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
