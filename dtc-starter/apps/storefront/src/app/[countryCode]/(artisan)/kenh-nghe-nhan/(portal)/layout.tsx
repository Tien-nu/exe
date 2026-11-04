import { getArtisanMe } from "@lib/data/artisan-portal"
import PortalNav from "@modules/artisan-portal/components/portal-nav"
import PixelIcon from "@modules/landing/components/pixel-icon"
import { redirect } from "next/navigation"

const STATUS_MESSAGES = {
  pending: {
    title: "Gian hàng đang chờ duyệt",
    body: "Yarnly sẽ duyệt đăng ký của bạn và gửi email khi xong. Sau đó bạn có thể đăng sản phẩm và nhận đơn.",
  },
  rejected: {
    title: "Đăng ký chưa được duyệt",
    body: "Vui lòng liên hệ Yarnly để biết thêm chi tiết.",
  },
  locked: {
    title: "Gian hàng đã bị khoá",
    body: "Sản phẩm của bạn đang bị ẩn khỏi sàn. Vui lòng liên hệ Yarnly.",
  },
} as const

export default async function PortalLayout(props: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const artisan = await getArtisanMe()

  if (!artisan) {
    redirect(`/${countryCode}/kenh-nghe-nhan/dang-nhap`)
  }

  const blocked = artisan.status !== "active" ? STATUS_MESSAGES[artisan.status] : null

  return (
    <div className="content-container grid grid-cols-1 gap-6 py-6 small:grid-cols-[260px_minmax(0,1fr)] small:gap-10 small:py-10">
      <aside className="small:sticky small:top-24 small:self-start">
        <PortalNav shopName={artisan.shop_name} />
      </aside>
      <div className="min-w-0 pb-16">
        {blocked ? (
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-[#ecd9a8] bg-[#fbf3df] p-6 small:flex-row small:p-8">
            <PixelIcon kind="flower" className="h-12 w-12 shrink-0" />
            <div className="flex flex-col gap-2">
              <h1 className="font-yarnly text-[28px] leading-tight tracking-[-0.02em]">
                {blocked.title}
              </h1>
              <p className="txt-medium leading-relaxed text-[#5f4512]">{blocked.body}</p>
              {artisan.status_reason && (
                <p className="txt-medium text-[#5f4512]">Lý do: {artisan.status_reason}</p>
              )}
            </div>
          </div>
        ) : (
          props.children
        )}
      </div>
    </div>
  )
}
