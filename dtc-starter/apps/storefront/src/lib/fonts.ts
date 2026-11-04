import { Lora } from "next/font/google"

// Georgia on Windows lacks precomposed Vietnamese letters (ấ, ề...), so
// headings set in `font-yarnly` use a serif that ships the Vietnamese subset.
// Put `yarnlySerif.variable` on a wrapper to enable it below that element.
export const yarnlySerif = Lora({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  variable: "--font-yarnly-serif",
  display: "swap",
})
