import { listArtisanCategories } from "@lib/data/artisan-portal"
import ProductForm from "@modules/artisan-portal/components/product-form"
import { Card } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default async function NewArtisanProductPage() {
  const categories = await listArtisanCategories()

  return (
    <div className="flex flex-col gap-4">
      <LocalizedClientLink href="/kenh-nghe-nhan/san-pham" className="txt-small text-ui-fg-subtle">
        ← Products
      </LocalizedClientLink>
      <h1 className="text-2xl-semi">Add product</h1>
      <Card>
        <ProductForm categories={categories} />
      </Card>
    </div>
  )
}
