import { ArrowUpRightMini } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { yarnlySerif } from "@lib/fonts"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Kênh nghệ nhân | Yarnly",
}

export default function ArtisanChannelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${yarnlySerif.variable} min-h-screen bg-yarnly-paper text-yarnly-ink`}>
      <header className="sticky top-0 z-40 border-b border-yarnly-line bg-yarnly-paper/90 backdrop-blur-md">
        <div className="content-container flex h-16 items-center justify-between gap-4">
          <LocalizedClientLink href="/kenh-nghe-nhan" className="flex items-baseline gap-3">
            <span className="font-yarnly text-[28px] leading-none tracking-[-0.07em]">
              Yarnly<span aria-hidden="true" className="text-yarnly-moss">.</span>
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-yarnly-moss">
              Kênh nghệ nhân
            </span>
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/home"
            className="inline-flex items-center gap-1 txt-small text-yarnly-muted transition-colors hover:text-yarnly-ink"
          >
            <span className="hidden xsmall:inline">Về trang mua sắm</span>
            <span className="xsmall:hidden">Mua sắm</span>
            <ArrowUpRightMini />
          </LocalizedClientLink>
        </div>
      </header>
      {children}
    </div>
  )
}
