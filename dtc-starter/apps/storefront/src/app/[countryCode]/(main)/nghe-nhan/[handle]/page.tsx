import { getArtisanShop } from "@lib/data/marketplace"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductPreview from "@modules/products/components/product-preview"
import { Metadata } from "next"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const shop = await getArtisanShop(handle)

  return {
    title: shop ? `${shop.artisan.shop_name} | Yarnly` : "Shop | Yarnly",
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
    <div className="content-container py-12">
      <div className="mb-10 flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-2xl text-violet-700">
          {shop.artisan.shop_name.charAt(0)}
        </span>
        <div>
          <h1 className="text-3xl-regular">{shop.artisan.shop_name}</h1>
          {shop.artisan.description && (
            <p className="txt-medium text-ui-fg-subtle">{shop.artisan.description}</p>
          )}
          <p className="txt-small text-ui-fg-subtle">{products.length} products</p>
        </div>
      </div>
      {products.length ? (
        <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
          {products.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="txt-medium text-ui-fg-subtle">This shop has no products yet.</p>
      )}
    </div>
  )
}
