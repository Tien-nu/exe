import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import HomeStory from "@modules/home/components/home-story"
import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"
import styles from "@modules/home/components/home-editorial.module.css"

export const metadata: Metadata = {
  title: "Yarnly — Vietnam's handmade crochet marketplace",
  description:
    "Discover handmade crochet products and meet the artisans behind every piece on Yarnly.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  if (!collections || !region) {
    return null
  }

  return (
    <div className={styles.home}>
      <Hero />
      <section
        id="san-pham"
        className="scroll-mt-20 bg-[var(--yarnly-paper)] py-10 md:py-16"
      >
        <div className="content-container mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--yarnly-terracotta)]">
              Find something to love
            </p>
            <h2 className="font-serif text-3xl font-medium tracking-[-0.035em] text-[var(--yarnly-ink)] md:text-5xl">
              Handmade comfort for gentle days.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-[var(--yarnly-muted)] md:text-base">
            Every product is handmade by a shop on Yarnly. Find a small gift, a cozy accessory, or request something made just for you.
          </p>
        </div>
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </section>
      <HomeStory />
    </div>
  )
}
