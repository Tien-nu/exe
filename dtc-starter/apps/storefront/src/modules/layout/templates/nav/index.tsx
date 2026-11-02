import { Suspense } from "react"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LanguageToggle from "@modules/common/components/language/language-toggle"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import Search from "@modules/layout/components/search"
import SideMenu from "@modules/layout/components/side-menu"
import NavSurface from "./nav-surface"

export default async function Nav() {
  const [regions, locales, currentLocale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
  ])

  return (
    <NavSurface>
      <nav className="content-container txt-xsmall-plus text-ui-fg-subtle flex items-center justify-between w-full h-full text-small-regular">
        <div className="flex-1 basis-0 h-full flex items-center">
          <div className="h-full">
            <SideMenu
              regions={regions}
              locales={locales}
              currentLocale={currentLocale}
            />
          </div>
        </div>

        <div className="flex items-center h-full">
          <LocalizedClientLink
            href="/"
            className="font-serif text-3xl tracking-[-0.06em]"
            data-testid="nav-store-link"
          >
            Yarnly
          </LocalizedClientLink>
        </div>

        <div className="flex items-center gap-x-4 small:gap-x-6 h-full flex-1 basis-0 justify-end">
          <LanguageToggle className="hidden small:inline-flex" />
          <Search />
          <div className="hidden small:flex items-center gap-x-6 h-full">
            <LocalizedClientLink
              className="hover:text-ui-fg-base"
              href="/nghe-nhan"
              data-testid="nav-artisans-link"
            >
              Artisans
            </LocalizedClientLink>
            <LocalizedClientLink
              className="hover:text-ui-fg-base"
              href="/account"
              data-testid="nav-account-link"
            >
              Account
            </LocalizedClientLink>
          </div>
          <Suspense
            fallback={
              <LocalizedClientLink
                className="hover:text-ui-fg-base flex gap-2"
                href="/cart"
                data-testid="nav-cart-link"
              >
                Cart (0)
              </LocalizedClientLink>
            }
          >
            <CartButton />
          </Suspense>
        </div>
      </nav>
    </NavSurface>
  )
}
