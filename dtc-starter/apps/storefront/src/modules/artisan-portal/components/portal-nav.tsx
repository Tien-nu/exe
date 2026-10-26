"use client"

import { artisanLogout } from "@lib/data/artisan-portal"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
import { useParams, usePathname } from "next/navigation"

const LINKS = [
  { href: "/kenh-nghe-nhan", label: "Overview" },
  { href: "/kenh-nghe-nhan/don-hang", label: "Ready-made orders" },
  { href: "/kenh-nghe-nhan/don-lam-rieng", label: "Custom orders" },
  { href: "/kenh-nghe-nhan/san-pham", label: "Products" },
  { href: "/kenh-nghe-nhan/thu-nhap", label: "Earnings" },
  { href: "/kenh-nghe-nhan/ho-so", label: "Shop profile" },
]

export default function PortalNav({ shopName }: { shopName: string }) {
  const { countryCode } = useParams() as { countryCode: string }
  const pathname = usePathname()
  const current = pathname.replace(`/${countryCode}`, "")

  return (
    <nav className="flex flex-col gap-1">
      <p className="txt-medium-plus mb-2 px-3">{shopName}</p>
      {LINKS.map((link) => {
        const active =
          link.href === "/kenh-nghe-nhan"
            ? current === link.href
            : current.startsWith(link.href)

        return (
          <LocalizedClientLink
            key={link.href}
            href={link.href}
            className={clx(
              "rounded-md px-3 py-2 txt-medium",
              active ? "bg-violet-100 text-violet-800" : "hover:bg-gray-100"
            )}
          >
            {link.label}
          </LocalizedClientLink>
        )
      })}
      <form action={() => artisanLogout(countryCode)}>
        <button type="submit" className="mt-4 w-full rounded-md px-3 py-2 text-left txt-medium text-ui-fg-subtle hover:bg-gray-100">
          Sign out
        </button>
      </form>
    </nav>
  )
}
