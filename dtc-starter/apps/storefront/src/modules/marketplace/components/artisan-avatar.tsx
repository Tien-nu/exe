import type { PublicArtisan } from "@lib/marketplace-types"
import { clx } from "@modules/common/components/ui"

/** The shop's photo, or its first letter on sage when it has none. */
export default function ArtisanAvatar({
  artisan,
  className,
}: {
  artisan: Pick<PublicArtisan, "shop_name" | "avatar_url">
  className?: string
}) {
  const base = clx(
    "relative shrink-0 rounded-full border-4 border-white bg-yarnly-sage shadow-[0_4px_14px_-6px_#33362f55]",
    className
  )

  if (artisan.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={artisan.avatar_url} alt="" className={clx(base, "object-cover")} />
  }

  return (
    <span
      aria-hidden="true"
      className={clx(base, "flex items-center justify-center font-yarnly text-yarnly-moss")}
    >
      {artisan.shop_name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
