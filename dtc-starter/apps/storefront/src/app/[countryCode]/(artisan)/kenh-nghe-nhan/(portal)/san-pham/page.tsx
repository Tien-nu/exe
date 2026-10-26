import { listArtisanProducts } from "@lib/data/artisan-portal"
import { formatVnd } from "@lib/util/vn-format"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default async function ArtisanProductsPage() {
  const products = await listArtisanProducts()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl-semi">Products</h1>
        <LocalizedClientLink
          href="/kenh-nghe-nhan/san-pham/moi"
          className="rounded-md bg-black px-4 py-2 txt-medium text-white hover:bg-gray-800"
        >
          Add product
        </LocalizedClientLink>
      </div>
      {products.length ? (
        <ul className="flex flex-col gap-2">
          {products.map((product) => {
            const prices = product.variants.map((variant) => variant.price)
            const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0)

            return (
              <li key={product.id}>
                <LocalizedClientLink
                  href={`/kenh-nghe-nhan/san-pham/${product.id}`}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-violet-300"
                >
                  {product.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.thumbnail} alt="" className="h-16 w-16 rounded-md object-cover" />
                  ) : (
                    <span className="h-16 w-16 rounded-md bg-gray-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="txt-medium-plus truncate">{product.title}</p>
                    <p className="txt-small text-ui-fg-subtle">
                      {product.fulfillment_type === "made_to_order"
                        ? `Made to order · ${product.lead_days} days`
                        : `In stock · quantity ${stock}`}
                      {" · "}
                      {product.variants.length} variants
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="txt-medium">
                      {Math.min(...prices) === Math.max(...prices)
                        ? formatVnd(prices[0])
                        : `${formatVnd(Math.min(...prices))} – ${formatVnd(Math.max(...prices))}`}
                    </p>
                    <p className={`txt-small ${product.status === "published" ? "text-emerald-700" : "text-ui-fg-subtle"}`}>
                      {product.status === "published" ? "Published" : "Hidden"}
                    </p>
                  </div>
                </LocalizedClientLink>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="txt-medium text-ui-fg-subtle">You have no products yet.</p>
      )}
    </div>
  )
}
