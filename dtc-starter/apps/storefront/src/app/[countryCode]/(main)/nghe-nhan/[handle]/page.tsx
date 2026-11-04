import { yarnlySerif } from "@lib/fonts"
import { getArtisanShop } from "@lib/data/marketplace"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { ArrowLeft } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PixelIcon from "@modules/landing/components/pixel-icon"
import ArtisanAvatar from "@modules/marketplace/components/artisan-avatar"
import ProductPreview from "@modules/products/components/product-preview"
import { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const shop = await getArtisanShop(handle)

  return {
    title: shop ? `${shop.artisan.shop_name} | Yarnly` : "Gian hàng | Yarnly",
    description: shop?.artisan.description ?? undefined,
  }
}

export default async function ArtisanShopPage(props: Props) {
  const { countryCode, handle } = await props.params
  const [shop, region] = await Promise.all([
    getArtisanShop(handle),
    getRegion(countryCode),
  ])

  if (!shop || !region) {
    notFound()
  }

  const products = shop.product_ids.length
    ? await listProducts({
        countryCode,
        queryParams: { id: shop.product_ids, limit: 100 },
      }).then(({ response }) => response.products)
    : []

  return (
    <div className={`${yarnlySerif.variable} bg-yarnly-paper text-yarnly-ink`}>
      <div className="content-container pb-16 pt-6 small:pb-24 small:pt-10">
        <LocalizedClientLink
          href="/nghe-nhan"
          className="inline-flex items-center gap-1.5 txt-small text-yarnly-muted transition-colors hover:text-yarnly-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Tất cả nghệ nhân
        </LocalizedClientLink>

        <section className="mt-4 overflow-hidden rounded-3xl border border-yarnly-line bg-white">
          <div className="relative h-36 small:h-56">
            <Image
              src="/images/yarnly-pixel-garden.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[60%_72%]"
            />
          </div>
          <div className="flex flex-col gap-5 px-6 pb-7 small:flex-row small:items-end small:justify-between small:gap-10 small:px-10 small:pb-9">
            <div className="flex flex-col gap-4 small:flex-row small:items-end small:gap-6">
              <ArtisanAvatar
                artisan={shop.artisan}
                className="-mt-12 h-24 w-24 text-[40px] small:-mt-14 small:h-32 small:w-32 small:text-[52px]"
              />
              <div className="flex max-w-2xl flex-col gap-2 small:pt-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-yarnly-moss">
                  Gian hàng nghệ nhân
                </p>
                <h1 className="font-yarnly text-[34px] leading-[1.05] tracking-[-0.035em] small:text-[48px]">
                  {shop.artisan.shop_name}
                </h1>
                {shop.artisan.description && (
                  <p className="txt-medium leading-relaxed text-yarnly-muted">
                    {shop.artisan.description}
                  </p>
                )}
              </div>
            </div>
            <dl className="flex shrink-0 gap-8 border-t border-yarnly-line pt-5 small:border-l small:border-t-0 small:pl-10 small:pt-0">
              <div className="flex flex-col gap-1">
                <dt className="txt-small text-yarnly-muted">Sản phẩm</dt>
                <dd className="font-yarnly text-[32px] leading-none tracking-[-0.03em]">
                  {products.length}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="txt-small text-yarnly-muted">Làm thủ công</dt>
                <dd className="flex h-8 items-center">
                  <PixelIcon kind="heart" className="h-7 w-7" />
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-12 small:mt-16" aria-labelledby="shop-products">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <h2
              id="shop-products"
              className="font-yarnly text-[28px] leading-tight tracking-[-0.03em] small:text-[36px]"
            >
              Sản phẩm của gian hàng
            </h2>
            <p className="txt-small text-yarnly-muted">{products.length} sản phẩm</p>
          </div>
          {products.length ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-10 small:grid-cols-3 small:gap-x-6 medium:grid-cols-4">
              {products.map((product) => (
                <li key={product.id}>
                  <ProductPreview product={product} region={region} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#cfd3c6] bg-yarnly-cream px-6 py-14 text-center">
              <PixelIcon kind="yarn" className="h-10 w-10" />
              <p className="font-yarnly text-xl">Gian hàng chưa có sản phẩm</p>
              <p className="max-w-sm txt-small text-yarnly-muted">
                Nghệ nhân đang chuẩn bị những món len đầu tiên. Bạn quay lại sau nhé.
              </p>
              <LocalizedClientLink
                href="/nghe-nhan"
                className="mt-2 txt-small text-yarnly-moss underline decoration-yarnly-moss/40 underline-offset-4 hover:decoration-yarnly-moss"
              >
                Xem các nghệ nhân khác
              </LocalizedClientLink>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
