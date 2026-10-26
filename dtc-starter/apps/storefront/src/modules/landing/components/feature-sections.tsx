"use client"

import Image from "next/image"
import { useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PixelIcon from "./pixel-icon"
import styles from "./feature-sections.module.css"

type FeatureKind = "catalog" | "custom" | "studio"
type FeatureTab = { title: string; description: string; image: string }

const sections: {
  id: string
  label: string
  title: string
  body: string
  kind: FeatureKind
  action: string
  href: string
  tabs: FeatureTab[]
}[] = [
  {
    id: "kham-pha",
    label: "1.0 — EXPLORE",
    title: "Find a crochet piece to keep close.",
    body: "From crochet companions to little accessories, explore the shops and find a design that makes you pause.",
    kind: "catalog",
    action: "Explore products",
    href: "/store",
    tabs: [
      {
        title: "Crochet plush toys",
        description:
          "Little friends crocheted by hand, each with a charm of its own.",
        image: "/images/crochet_bear.png",
      },
      {
        title: "Flowers and gifts",
        description:
          "A flower that lasts, a gift that says what words cannot.",
        image: "/images/cuu_hoa_len.jpg",
      },
      {
        title: "Everyday accessories",
        description:
          "Keychains, bags, hats, and handmade details that brighten everyday life.",
        image: "/images/moc_khoa.jpg",
      },
    ],
  },
  {
    id: "lam-rieng",
    label: "2.0 — CUSTOM MADE",
    title: "Your idea. A truly personal gift.",
    body: "Already imagining your perfect piece? Send a request and work with an artisan to choose the colors, size, and details.",
    kind: "custom",
    action: "Send your request",
    href: "/account/yeu-cau-lam-rieng",
    tabs: [
      {
        title: "Choose your colors",
        description:
          "Start with a color you love or a palette for someone special.",
        image: "/images/moc_khoa.jpg",
      },
      {
        title: "Share your idea",
        description:
          "Describe the shape, size, and details that make your piece special.",
        image: "/images/cuu_hoa_len.jpg",
      },
      {
        title: "Talk to an artisan",
        description:
          "Work out the details together before the artisan begins crocheting.",
        image: "/images/crochet_bear.png",
      },
    ],
  },
  {
    id: "nghe-nhan",
    label: "3.0 — FOR ARTISANS",
    title: "You make something special. Yarnly helps others find it.",
    body: "Bring your products, style, and story to your own shop. Connect with people who appreciate handmade craft.",
    kind: "studio",
    action: "Open a Yarnly shop",
    href: "/kenh-nghe-nhan/dang-ky",
    tabs: [
      {
        title: "Showcase your products",
        description:
          "Create a home for your handmade collection and signature designs.",
        image: "/images/tui_xach.jpg",
      },
      {
        title: "Accept custom requests",
        description:
          "Discover your customers' ideas and discuss what you can create together.",
        image: "/images/moc_khoa.jpg",
      },
      {
        title: "Track orders",
        description:
          "Manage products, requests, and orders in the artisan portal.",
        image: "/images/cardigan.jpg",
      },
    ],
  },
]

function FeatureRow({
  section,
  index,
}: {
  section: (typeof sections)[number]
  index: number
}) {
  const [active, setActive] = useState(0)
  const selected = section.tabs[active]

  return (
    <section
      id={section.id}
      className={
        styles.featureRow + (index % 2 ? " " + styles.featureReverse : "")
      }
    >
      <div className={styles.featureCopy}>
        <p className={styles.eyebrow}>{section.label}</p>
        <h3>{section.title}</h3>
        <p>{section.body}</p>
        <div className={styles.accordionList}>
          {section.tabs.map((tab, tabIndex) => (
            <div key={tab.title} className={styles.accordionItem}>
              <button
                type="button"
                onClick={() => setActive(tabIndex)}
                aria-expanded={active === tabIndex}
                aria-controls={section.id + "-" + tabIndex}
              >
                <span className={styles.stepNumber}>
                  {index + 1}.{tabIndex + 1}
                </span>
                <span>{tab.title}</span>
                <span className={styles.plus} aria-hidden="true">
                  {active === tabIndex ? "−" : "+"}
                </span>
              </button>
              <div
                id={section.id + "-" + tabIndex}
                hidden={active !== tabIndex}
                className={styles.accordionDescription}
              >
                {tab.description}
              </div>
            </div>
          ))}
        </div>
        <LocalizedClientLink href={section.href} className={styles.textLink}>
          {section.action} <span aria-hidden="true">↗</span>
        </LocalizedClientLink>
      </div>

      <div className={styles.featureVisual} aria-label={selected.title}>
        <div className={styles.previewBar}>
          <span className={styles.previewDots}>
            <i />
            <i />
            <i />
          </span>
          <span>
            {section.kind === "studio"
              ? "Your shop · illustration"
              : section.kind === "custom"
              ? "Custom idea · illustration"
              : "A glimpse of the collection"}
          </span>
          <PixelIcon kind="yarn" />
        </div>
        {section.kind === "catalog" && (
          <div className={styles.catalogPreview}>
            <div className={styles.catalogMain}>
              <Image
                src={selected.image}
                alt={selected.title}
                fill
                sizes="(max-width: 760px) 85vw, 40vw"
              />
            </div>
            <div className={styles.catalogSidebar}>
              <p>HANDMADE CROCHET</p>
              <h4>{selected.title}</h4>
              <span>
                A little softness
                <br />
                for your day.
              </span>
              <div className={styles.previewThumbs}>
                {section.tabs
                  .filter((_, i) => i !== active)
                  .map((tab) => (
                    <div key={tab.title}>
                      <Image src={tab.image} alt="" fill sizes="100px" />
                    </div>
                  ))}
              </div>
              <span className={styles.previewTag}>Handmade · Vietnam</span>
            </div>
          </div>
        )}
        {section.kind === "custom" && (
          <div className={styles.customPreview}>
            <div className={styles.customImage}>
              <Image
                src={selected.image}
                alt={selected.title}
                fill
                sizes="(max-width: 760px) 45vw, 24vw"
              />
            </div>
            <div className={styles.requestCard}>
              <PixelIcon kind="gift" />
              <p className={styles.eyebrow}>A GIFT OF YOUR OWN</p>
              <h4>{selected.title}</h4>
              <p>What makes this piece special?</p>
              <div className={styles.colorSwatches} aria-label="Yarn color inspiration">
                <span style={{ background: "#e4d8bf" }} />
                <span style={{ background: "#a6b591" }} />
                <span style={{ background: "#d39e8d" }} />
                <span style={{ background: "#8faabb" }} />
              </div>
              <div className={styles.notePaper}>
                I'd like a little gift,
                <br />
                in their favorite colors…<span>Example custom idea</span>
              </div>
              <div className={styles.requestStatus}>
                <i /> Talk it through with an artisan
              </div>
            </div>
          </div>
        )}
        {section.kind === "studio" && (
          <div className={styles.studioPreview}>
            <div className={styles.studioTitle}>
              <span className={styles.miniBrand}>Your shop</span>
              <span>Products · Requests · Orders</span>
            </div>
            <div className={styles.studioBoard}>
              {[
                "Handmade products",
                "Custom ideas",
                "Connect with customers",
              ].map((label, i) => (
                <div
                  key={label}
                  className={
                    active === i ? styles.studioColumnActive : undefined
                  }
                >
                  <p>{label}</p>
                  <div className={styles.studioCard}>
                    <div>
                      <Image
                        src={section.tabs[i].image}
                        alt={section.tabs[i].title}
                        fill
                        sizes="(max-width: 760px) 25vw, 15vw"
                      />
                    </div>
                    <span>{section.tabs[i].title}</span>
                    <span className={styles.studioCardNote}>
                      A story in yarn
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.studioFoot}>
              <PixelIcon kind="heart" />
              <span>Start with the pieces you make by hand.</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default function FeatureSections() {
  return (
    <div className={styles.featureSections}>
      {sections.map((section, index) => (
        <FeatureRow key={section.id} section={section} index={index} />
      ))}
    </div>
  )
}
