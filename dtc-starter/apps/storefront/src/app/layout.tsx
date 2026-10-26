import { getBaseURL } from "@lib/util/env"
import { FeedbackProvider } from "@modules/common/components/feedback"
import SmoothSectionNavigation from "@modules/common/components/smooth-section-navigation"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SmoothSectionNavigation />
        <FeedbackProvider>
          <main className="relative">{props.children}</main>
        </FeedbackProvider>
      </body>
    </html>
  )
}
