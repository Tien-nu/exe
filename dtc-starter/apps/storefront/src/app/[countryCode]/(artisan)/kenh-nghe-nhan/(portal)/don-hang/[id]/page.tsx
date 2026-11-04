import { getArtisanSubOrder } from "@lib/data/artisan-portal"
import { formatDateTime, formatVnd } from "@lib/util/vn-format"
import SubOrderActions from "@modules/artisan-portal/components/sub-order-actions"
import SubOrderNextStep from "@modules/artisan-portal/components/sub-order-summary"
import { Card, Notice, PageHeader, StatusBadge } from "@modules/artisan-portal/ui"
import { clx } from "@modules/common/components/ui"
import { notFound } from "next/navigation"

export default async function ArtisanOrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const subOrder = await getArtisanSubOrder(id)

  if (!subOrder) {
    notFound()
  }

  const timeline = [
    ["Đặt hàng", subOrder.created_at],
    ["Nhận đơn", subOrder.accepted_at],
    ["Làm xong", subOrder.ready_at],
    ["Giao cho vận chuyển", subOrder.shipped_at],
    ["Đã giao", subOrder.delivered_at],
    ["Hoàn thành", subOrder.completed_at],
    ["Huỷ", subOrder.canceled_at],
  ].filter(([, date]) => date) as [string, string][]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{
          href: subOrder.is_custom ? "/kenh-nghe-nhan/don-lam-rieng" : "/kenh-nghe-nhan/don-hang",
          label: subOrder.is_custom ? "Đơn làm riêng" : "Đơn hàng",
        }}
        title={`Đơn ${subOrder.code}`}
        actions={<StatusBadge status={subOrder.status} label={subOrder.status_label} />}
      />
      <Notice tone={subOrder.status === "pending_acceptance" ? "warning" : "info"}>
        <SubOrderNextStep subOrder={subOrder} />
      </Notice>
      <SubOrderActions subOrder={subOrder} />

      {subOrder.custom_request && (
        <Card title="Yêu cầu làm riêng đã thống nhất">
          <p className="txt-medium leading-relaxed">{subOrder.custom_request.description}</p>
          <p className="mt-2 txt-small text-yarnly-muted">
            {subOrder.custom_request.color && `Màu: ${subOrder.custom_request.color} · `}
            {subOrder.custom_request.size && `Kích thước: ${subOrder.custom_request.size} · `}
            Giá đã báo {formatVnd(subOrder.custom_request.quoted_price)}/cái · {subOrder.custom_request.quoted_lead_days} ngày
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 medium:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="Sản phẩm">
          <ul className="flex flex-col divide-y divide-yarnly-line">
            {subOrder.items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 py-3 first:pt-0">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-16 w-16 rounded-xl border border-yarnly-line object-cover"
                  />
                ) : (
                  <span className="h-16 w-16 rounded-xl bg-yarnly-paper" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="txt-medium-plus">{item.title}</p>
                  <p className="txt-small text-yarnly-muted">
                    {item.variant_title} · {item.made_to_order ? "Làm theo đơn" : "Hàng có sẵn"}
                  </p>
                </div>
                <p className="whitespace-nowrap txt-medium">
                  {item.quantity} × {formatVnd(item.unit_price)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-end gap-1 border-t border-yarnly-line pt-4">
            <p className="txt-medium">
              Tiền hàng:{" "}
              <span className="font-yarnly text-xl tracking-[-0.01em]">{formatVnd(subOrder.subtotal)}</span>
            </p>
            <p className="text-right txt-small text-yarnly-muted">
              {subOrder.payment_method === "cod"
                ? "Khách trả khi nhận hàng (COD)"
                : "Khách đã chuyển khoản cho Yarnly"}{" "}
              · Yarnly chuyển tiền cho bạn thứ Hai sau khi đơn hoàn thành
            </p>
          </div>
        </Card>

        <Card title="Lịch sử" className="medium:self-start">
          <ol className="flex flex-col">
            {timeline.map(([label, date], index) => {
              const last = index === timeline.length - 1

              return (
                <li key={label} className="relative flex gap-3 pb-5 last:pb-0">
                  {!last && (
                    <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-yarnly-line" />
                  )}
                  <span
                    aria-hidden="true"
                    className={clx(
                      "relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2",
                      last
                        ? label === "Huỷ"
                          ? "border-[#8f4333] bg-[#8f4333]"
                          : "border-yarnly-moss bg-yarnly-moss"
                        : "border-yarnly-moss bg-white"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="txt-medium-plus">{label}</span>
                    <span className="txt-small text-yarnly-muted">{formatDateTime(date)}</span>
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>
    </div>
  )
}
