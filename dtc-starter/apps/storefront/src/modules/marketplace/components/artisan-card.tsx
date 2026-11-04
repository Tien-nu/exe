import type { PublicArtisan } from "@lib/marketplace-types"
import { ArrowRightMini } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PixelIcon from "@modules/landing/components/pixel-icon"
import ArtisanAvatar from "./artisan-avatar"

// Each card gets one of these in turn so the grid reads like a yarn basket.
const TONES = [
  { background: "#e8edde", icon: "yarn" },
  { background: "#f5e4d8", icon: "flower" },
  { background: "#e1eaf0", icon: "gift" },
  { background: "#f3ecd6", icon: "heart" },
] as const

export default function ArtisanCard({
  artisan,
  index,
}: {
  artisan: PublicArtisan
  index: number
}) {
  const tone = TONES[index % TONES.length]

  return (
    <LocalizedClientLink
      href={`/nghe-nhan/${artisan.handle}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-yarnly-line bg-white transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-yarnly-ink hover:shadow-[0_18px_40px_-24px_#33362f66]"
    >
      <div
        aria-hidden="true"
        className="relative h-28"
        style={{
          backgroundColor: tone.background,
          backgroundImage: "radial-gradient(#ffffff99 1.5px, transparent 1.6px)",
          backgroundSize: "14px 14px",
        }}
      >
        <PixelIcon
          kind={tone.icon}
          className="absolute bottom-3 right-4 h-14 w-14 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-6"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pb-5">
        <ArtisanAvatar artisan={artisan} className="-mt-9 mb-1 h-[72px] w-[72px] text-[28px]" />
        <h2 className="font-yarnly text-[24px] leading-tight tracking-[-0.02em] text-yarnly-ink">
          {artisan.shop_name}
        </h2>
        <p className="line-clamp-3 txt-small leading-relaxed text-yarnly-muted">
          {artisan.description || "Gian hàng đồ len thủ công trên Yarnly."}
        </p>
        <span className="mt-auto inline-flex items-center gap-0.5 pt-4 txt-small font-medium text-yarnly-moss">
          Xem gian hàng
          <ArrowRightMini className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </LocalizedClientLink>
  )
}
