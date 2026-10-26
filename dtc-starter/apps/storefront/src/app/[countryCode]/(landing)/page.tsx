import type { Metadata } from "next"

import YarnlyLanding from "@modules/landing/templates/yarnly-landing"

export const metadata: Metadata = {
  title: "Yarnly — A world of handmade crochet",
  description:
    "Discover handmade crochet, meet Vietnamese artisans, and commission a gift of your own on Yarnly.",
}

export default function YarnlyLandingPage() {
  return <YarnlyLanding />
}
