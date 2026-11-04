import { listArtisanSubOrders } from "@lib/data/artisan-portal"
import SubOrderCard from "@modules/artisan-portal/components/sub-order-card"
import { EmptyState, FilterTabs, PageHeader, linkClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const TABS = [
  { status: "", label: "Tất cả" },
  { status: "pending_acceptance", label: "Chờ xác nhận" },
  { status: "processing", label: "Đang làm" },
  { status: "ready_to_ship", label: "Chờ giao" },
  { status: "shipping", label: "Đang giao" },
  { status: "completed", label: "Hoàn thành" },
  { status: "canceled", label: "Đã huỷ" },
]

/** Orders for listed products; custom-made ones live in "Đơn làm riêng". */
export default async function ArtisanOrdersPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status = "" } = await props.searchParams
  const subOrders = await listArtisanSubOrders(status || undefined, false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Đơn hàng"
        title="Đơn hàng có sẵn"
        description={
          <>
            Đơn đặt sản phẩm đang bán. Đơn làm theo yêu cầu riêng xem ở{" "}
            <LocalizedClientLink href="/kenh-nghe-nhan/don-lam-rieng" className={linkClass}>
              Đơn làm riêng
            </LocalizedClientLink>
            .
          </>
        }
      />
      <FilterTabs
        label="Lọc theo trạng thái"
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
          title="Không có đơn nào"
          description="Đơn mới sẽ hiện ở đây ngay khi khách đặt sản phẩm của bạn."
        />
      )}
    </div>
  )
}
