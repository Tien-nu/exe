import { retrieveCustomer } from "@lib/data/customer"
import { getProductArtisan } from "@lib/data/marketplace"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CustomRequestForm from "./custom-request-form"

/** Who makes this product, how it is made, and the custom-request form. */
export default async function ProductArtisanBlock({ productId }: { productId: string }) {
  const [info, customer] = await Promise.all([
    getProductArtisan(productId),
    retrieveCustomer().catch(() => null),
  ])

  if (!info?.artisan) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <div>
        <LocalizedClientLink
          href={`/nghe-nhan/${info.artisan.handle}`}
          className="txt-medium-plus text-violet-700 hover:underline"
        >
          {info.artisan.shop_name}
        </LocalizedClientLink>
      </div>
      <span
        className={`w-fit rounded-full px-3 py-1 txt-small-plus ${
          info.fulfillment_type === "made_to_order"
            ? "bg-violet-100 text-violet-800"
            : "bg-emerald-100 text-emerald-800"
        }`}
      >
        {info.fulfillment_type === "made_to_order"
          ? `Made to order · about ${info.lead_days} days`
          : "Ready to ship"}
      </span>
      <p className="txt-small text-ui-fg-subtle">
        {info.artisan.shop_name} confirms orders within 12 hours. Per parcel: 18,000 VND within the origin province, 22,000 VND to another province.
      </p>
      <CustomRequestForm
        productId={productId}
        shopName={info.artisan.shop_name}
        isLoggedIn={!!customer}
      />
    </div>
  )
}
