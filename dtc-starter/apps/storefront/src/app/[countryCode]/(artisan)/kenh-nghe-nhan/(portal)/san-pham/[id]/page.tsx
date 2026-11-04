import { getArtisanProduct, listArtisanCategories } from "@lib/data/artisan-portal"
import { ArrowUpRightMini } from "@medusajs/icons"
import ProductForm from "@modules/artisan-portal/components/product-form"
import { Card, PageHeader, linkClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
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
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/kenh-nghe-nhan/san-pham", label: "Sản phẩm" }}
        title={product.title}
        actions={
          <LocalizedClientLink
            href={`/products/${product.handle}`}
            className={clx("inline-flex items-center gap-0.5 txt-small", linkClass)}
          >
            Xem trên sàn
            <ArrowUpRightMini />
          </LocalizedClientLink>
        }
      />
      <Card>
        <ProductForm key={product.id} product={product} categories={categories} />
      </Card>
    </div>
  )
}
