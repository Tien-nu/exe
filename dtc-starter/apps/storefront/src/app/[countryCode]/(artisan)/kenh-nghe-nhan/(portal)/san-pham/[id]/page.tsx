import { getArtisanProduct, listArtisanCategories } from "@lib/data/artisan-portal"
import ProductForm from "@modules/artisan-portal/components/product-form"
import { Card } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { notFound } from "next/navigation"

export default async function EditArtisanProductPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const [product, categories] = await Promise.all([
    getArtisanProduct(id),
    listArtisanCategories(),
  ])

  if (!product) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <LocalizedClientLink href="/kenh-nghe-nhan/san-pham" className="txt-small text-ui-fg-subtle">
        ← Products
      </LocalizedClientLink>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl-semi">{product.title}</h1>
        <LocalizedClientLink
          href={`/products/${product.handle}`}
          className="txt-small text-violet-700 underline"
        >
          View on marketplace
        </LocalizedClientLink>
      </div>
      <Card>
        <ProductForm key={product.id} product={product} categories={categories} />
      </Card>
    </div>
  )
}
