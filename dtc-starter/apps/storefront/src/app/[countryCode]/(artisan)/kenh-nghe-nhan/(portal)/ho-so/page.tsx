import { getArtisanMe } from "@lib/data/artisan-portal"
import { ArrowUpRightMini } from "@medusajs/icons"
import ProfileForm from "@modules/artisan-portal/components/profile-form"
import { Card, PageHeader, linkClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"

export default async function ArtisanProfilePage() {
  const artisan = await getArtisanMe()

  if (!artisan) {
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gian hàng"
        title="Hồ sơ gian hàng"
        description="Thông tin hiển thị cho khách, địa chỉ để shipper GHN tới lấy hàng và tài khoản nhận tiền."
        actions={
          <LocalizedClientLink
            href={`/nghe-nhan/${artisan.handle}`}
            className={clx("inline-flex items-center gap-0.5 txt-small", linkClass)}
          >
            Xem gian hàng của bạn
            <ArrowUpRightMini />
          </LocalizedClientLink>
        }
      />
      <Card>
        <ProfileForm artisan={artisan} />
      </Card>
    </div>
  )
}
