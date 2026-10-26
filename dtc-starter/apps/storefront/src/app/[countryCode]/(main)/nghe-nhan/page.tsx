import { listArtisans } from "@lib/data/marketplace"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Artisans | Yarnly",
  description: "Handmade crochet shops on Yarnly.",
}

export default async function ArtisansPage() {
  const artisans = await listArtisans()

  return (
    <div className="content-container py-12">
      <h1 className="text-3xl-regular mb-2">Artisans on Yarnly</h1>
      <p className="txt-medium text-ui-fg-subtle mb-8">
        Every crochet piece is made by a real artisan. Choose a shop to explore its products.
      </p>
      <ul className="grid grid-cols-1 small:grid-cols-2 medium:grid-cols-3 gap-4">
        {artisans.map((artisan) => (
          <li key={artisan.id}>
            <LocalizedClientLink
              href={`/nghe-nhan/${artisan.handle}`}
              className="flex h-full flex-col gap-2 rounded-md border border-gray-200 p-5 hover:border-violet-300"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-xl text-violet-700">
                {artisan.shop_name.charAt(0)}
              </span>
              <span className="txt-medium-plus">{artisan.shop_name}</span>
              {artisan.description && (
                <span className="txt-small text-ui-fg-subtle line-clamp-3">
                  {artisan.description}
                </span>
              )}
            </LocalizedClientLink>
          </li>
        ))}
      </ul>
      <div className="mt-12 rounded-md bg-violet-50 p-6">
        <p className="txt-medium-plus">Do you make handmade crochet?</p>
        <p className="txt-medium text-ui-fg-subtle mb-3">
          Open a free shop on Yarnly, receive orders, and get paid every Monday.
        </p>
        <LocalizedClientLink href="/kenh-nghe-nhan/dang-ky" className="text-violet-700 underline">
          Become an artisan
        </LocalizedClientLink>
      </div>
    </div>
  )
}
