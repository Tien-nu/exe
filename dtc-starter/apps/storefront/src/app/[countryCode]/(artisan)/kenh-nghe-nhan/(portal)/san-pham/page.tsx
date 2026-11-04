import { listArtisanProducts } from "@lib/data/artisan-portal"
import { formatVnd } from "@lib/util/vn-format"
import { Plus } from "@medusajs/icons"
import { EmptyState, PageHeader, buttonClass } from "@modules/artisan-portal/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"

const AddProductLink = () => (
  <LocalizedClientLink href="/kenh-nghe-nhan/san-pham/moi" className={buttonClass()}>
    <Plus />
    Thêm sản phẩm
  </LocalizedClientLink>
)

export default async function ArtisanProductsPage() {
  const products = await listArtisanProducts()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gian hàng"
        title="Sản phẩm"
        description="Sản phẩm bạn đang bán và đang ẩn trên sàn Yarnly."
        actions={products.length > 0 && <AddProductLink />}
      />
      {products.length ? (
        <ul className="flex flex-col gap-3">
          {products.map((product) => {
            const prices = product.variants.map((variant) => variant.price)
            const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0)
            const published = product.status === "published"

            return (
              <li key={product.id}>
                <LocalizedClientLink
                  href={`/kenh-nghe-nhan/san-pham/${product.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-yarnly-line bg-white p-3 transition-[border-color,box-shadow] hover:border-yarnly-ink hover:shadow-[0_6px_20px_-12px_#33362f40] small:p-4"
                >
                  {product.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.thumbnail}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl object-cover small:h-20 small:w-20"
                    />
                  ) : (
                    <span className="h-16 w-16 shrink-0 rounded-xl bg-yarnly-paper small:h-20 small:w-20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-yarnly text-lg tracking-[-0.01em]">{product.title}</p>
                    <p className="txt-small text-yarnly-muted">
                      {product.fulfillment_type === "made_to_order"
                        ? `Làm theo đơn · ${product.lead_days} ngày`
                        : `Có sẵn · tồn ${stock}`}
                      {" · "}
                      {product.variants.length} phân loại
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <p className="txt-medium-plus">
                      {Math.min(...prices) === Math.max(...prices)
                        ? formatVnd(prices[0])
                        : `${formatVnd(Math.min(...prices))} – ${formatVnd(Math.max(...prices))}`}
                    </p>
                    <span
                      className={clx(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                        published
                          ? "bg-yarnly-sage text-yarnly-moss-dark"
                          : "bg-[#ecebe5] text-[#55594f]"
                      )}
                    >
                      {published ? "Đang bán" : "Đang ẩn"}
                    </span>
                  </div>
                </LocalizedClientLink>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          title="Bạn chưa có sản phẩm nào"
          description="Đăng món len đầu tiên để khách tìm thấy gian hàng của bạn."
          action={<AddProductLink />}
        />
      )}
    </div>
  )
}
