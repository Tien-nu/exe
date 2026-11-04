"use client"

import { artisanLogout } from "@lib/data/artisan-portal"
import {
  ArrowRightOnRectangle,
  BuildingStorefront,
  Cash,
  ChartBar,
  ShoppingBag,
  Sparkles,
  Tag,
} from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
import { useParams, usePathname } from "next/navigation"

const LINKS = [
  { href: "/kenh-nghe-nhan", label: "Tổng quan", icon: ChartBar },
  { href: "/kenh-nghe-nhan/don-hang", label: "Đơn hàng có sẵn", icon: ShoppingBag },
  { href: "/kenh-nghe-nhan/don-lam-rieng", label: "Đơn làm riêng", icon: Sparkles },
  { href: "/kenh-nghe-nhan/san-pham", label: "Sản phẩm", icon: Tag },
  { href: "/kenh-nghe-nhan/thu-nhap", label: "Thu nhập", icon: Cash },
  { href: "/kenh-nghe-nhan/ho-so", label: "Hồ sơ gian hàng", icon: BuildingStorefront },
]

const LogoutButton = ({ countryCode, className }: { countryCode: string; className?: string }) => (
  <form action={() => artisanLogout(countryCode)} className={className}>
    <button
      type="submit"
      className="inline-flex h-10 w-full items-center gap-3 rounded-lg px-3 txt-small text-yarnly-muted transition-colors hover:bg-yarnly-paper hover:text-yarnly-ink"
    >
      <ArrowRightOnRectangle />
      Đăng xuất
    </button>
  </form>
)

export default function PortalNav({ shopName }: { shopName: string }) {
  const { countryCode } = useParams() as { countryCode: string }
  const pathname = usePathname()
  const current = pathname.replace(`/${countryCode}`, "")

  return (
    <div className="rounded-2xl border border-yarnly-line bg-white p-3 small:p-4">
      <div className="flex items-center gap-3 border-b border-yarnly-line px-1 pb-3 small:pb-4">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yarnly-sage font-yarnly text-xl text-yarnly-moss"
        >
          {shopName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-yarnly-muted">
            Gian hàng
          </p>
          <p className="truncate font-yarnly text-lg leading-tight text-yarnly-ink">{shopName}</p>
        </div>
        <LogoutButton countryCode={countryCode} className="shrink-0 small:hidden" />
      </div>
      <nav aria-label="Kênh nghệ nhân" className="-mx-1 mt-3 overflow-x-auto px-1">
        <ul className="flex w-max gap-1 small:w-auto small:flex-col">
          {LINKS.map((link) => {
            const active =
              link.href === "/kenh-nghe-nhan"
                ? current === link.href
                : current.startsWith(link.href)
            const Icon = link.icon

            return (
              <li key={link.href}>
                <LocalizedClientLink
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={clx(
                    "flex h-10 items-center gap-3 whitespace-nowrap rounded-lg px-3 txt-medium transition-colors",
                    active
                      ? "bg-yarnly-sage font-medium text-yarnly-ink"
                      : "text-yarnly-muted hover:bg-yarnly-paper hover:text-yarnly-ink"
                  )}
                >
                  <Icon className={active ? "text-yarnly-moss" : undefined} />
                  {link.label}
                </LocalizedClientLink>
              </li>
            )
          })}
        </ul>
      </nav>
      <LogoutButton
        countryCode={countryCode}
        className="mt-3 hidden border-t border-yarnly-line pt-3 small:block"
      />
    </div>
  )
}
