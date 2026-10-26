import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Artisan Portal | Yarnly",
}

export default function ArtisanChannelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="content-container flex h-14 items-center justify-between">
          <LocalizedClientLink href="/kenh-nghe-nhan" className="txt-compact-xlarge-plus uppercase">
            Yarnly <span className="text-violet-700 normal-case">· Artisan Portal</span>
          </LocalizedClientLink>
          <LocalizedClientLink href="/" className="txt-small text-ui-fg-subtle hover:text-ui-fg-base">
            Back to shopping
          </LocalizedClientLink>
        </div>
      </header>
      {children}
    </div>
  )
}
