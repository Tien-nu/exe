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
        eyebrow="Shop"
        title="Shop profile"
        description="What customers see, the pickup address used for shipping, and the account Yarnly pays you into."
        actions={
          <LocalizedClientLink
            href={`/nghe-nhan/${artisan.handle}`}
            className={clx("inline-flex items-center gap-0.5 txt-small", linkClass)}
          >
            View your shop
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
