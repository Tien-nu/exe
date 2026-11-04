import { listArtisanCategories } from "@lib/data/artisan-portal"
import ProductForm from "@modules/artisan-portal/components/product-form"
import { Card, PageHeader } from "@modules/artisan-portal/ui"

export default async function NewArtisanProductPage() {
  const categories = await listArtisanCategories()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/kenh-nghe-nhan/san-pham", label: "Sản phẩm" }}
        title="Thêm sản phẩm"
      />
      <Card>
        <ProductForm categories={categories} />
      </Card>
    </div>
  )
}
