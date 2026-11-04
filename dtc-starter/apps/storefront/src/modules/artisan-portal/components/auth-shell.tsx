import { clx } from "@modules/common/components/ui"
import PixelIcon from "@modules/landing/components/pixel-icon"
import Image from "next/image"

const PERKS = [
  { icon: "yarn", text: "Đăng món len của bạn và nhận đơn trên sàn Yarnly" },
  { icon: "gift", text: "Báo giá đơn làm riêng theo ý khách" },
  { icon: "heart", text: "Shipper GHN tới tận nơi lấy hàng" },
  { icon: "flower", text: "Nhận tiền mỗi thứ Hai, phí sàn hiện tại 0%" },
] as const

/** Login and sign-up: the pixel garden on one side, the form on the other. */
export default function AuthShell({
  eyebrow,
  title,
  description,
  wide,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={clx(
        "content-container grid grid-cols-1 gap-6 py-6 small:items-start small:gap-10 small:py-12",
        wide
          ? "small:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
          : "small:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
      )}
    >
      <aside className="relative isolate flex h-40 flex-col justify-end overflow-hidden rounded-3xl p-6 text-white small:sticky small:top-24 small:h-[min(640px,calc(100vh-8rem))] small:p-10">
        <Image
          src="/images/yarnly-pixel-garden.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="-z-10 object-cover object-[80%_60%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[#1d2a1b]/90 via-[#1d2a1b]/40 to-transparent"
        />
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/80">
          Kênh nghệ nhân Yarnly
        </p>
        <p className="mt-2 max-w-md font-yarnly text-2xl leading-tight tracking-[-0.03em] small:text-[40px]">
          Mỗi mũi len là một câu chuyện của bạn.
        </p>
        <ul className="mt-8 hidden flex-col gap-3 small:flex">
          {PERKS.map((perk) => (
            <li key={perk.text} className="flex items-center gap-3 txt-medium text-white/90">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                <PixelIcon kind={perk.icon} className="h-5 w-5" />
              </span>
              {perk.text}
            </li>
          ))}
        </ul>
      </aside>

      <section className="rounded-3xl border border-yarnly-line bg-white p-6 xsmall:p-8 small:p-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-yarnly-moss">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-yarnly text-[30px] leading-[1.1] tracking-[-0.03em] small:text-[36px]">
          {title}
        </h1>
        <p className="mb-8 mt-2 txt-medium text-yarnly-muted">{description}</p>
        {children}
      </section>
    </div>
  )
}
