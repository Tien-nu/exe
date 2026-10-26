import { getArtisanMe } from "@lib/data/artisan-portal"
import PortalNav from "@modules/artisan-portal/components/portal-nav"
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
    <div className="content-container grid grid-cols-1 gap-6 py-8 small:grid-cols-[220px_1fr]">
      <aside>
        <PortalNav shopName={artisan.shop_name} />
      </aside>
      <div className="min-w-0">
        {blocked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h1 className="txt-xlarge-plus mb-2">{blocked.title}</h1>
            <p className="txt-medium">{blocked.body}</p>
            {artisan.status_reason && (
              <p className="txt-medium mt-2">Reason: {artisan.status_reason}</p>
            )}
          </div>
        ) : (
          props.children
        )}
      </div>
    </div>
  )
}
