import { getArtisanMe } from "@lib/data/artisan-portal"
import PortalNav from "@modules/artisan-portal/components/portal-nav"
import { Notice, linkClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PixelIcon from "@modules/landing/components/pixel-icon"
import { redirect } from "next/navigation"

const STATUS_MESSAGES = {
  pending: {
    title: "Your shop is awaiting approval",
    body: "Yarnly will review your registration and email you when it is approved. You can then list products and accept orders.",
  },
  rejected: {
    title: "Registration not approved",
    body: "Please contact Yarnly for more information.",
  },
  locked: {
    title: "Your shop has been suspended",
    body: "Your products are hidden from the marketplace. Please contact Yarnly.",
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
                <p className="txt-medium text-[#5f4512]">Reason: {artisan.status_reason}</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {!artisan.pickup_province_name && (
              // Checkout refuses this shop's items until the shipping fee has an origin.
              <Notice tone="warning" className="mb-6">
                Customers cannot check out your products until you add a pickup province/city.{" "}
                <LocalizedClientLink href="/kenh-nghe-nhan/ho-so" className={linkClass}>
                  Update your shop profile
                </LocalizedClientLink>
              </Notice>
            )}
            {props.children}
          </>
        )}
      </div>
    </div>
  )
}
