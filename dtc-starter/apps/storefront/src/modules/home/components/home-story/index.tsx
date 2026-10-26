import Image from "next/image"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "../home-editorial.module.css"

const makingSteps = [
  {
    number: "01 / EXPLORE",
    title: "Choose something you love",
    description:
      "A crochet companion, a flower, or a little accessory. Start with something that makes you smile.",
  },
  {
    number: "02 / CONNECT",
    title: "Meet its maker",
    description:
      "Visit the shop and discover the style and story behind every stitch.",
  },
  {
    number: "03 / CUSTOM MADE",
    title: "Make it your own",
    description:
      "Share your colors, size, and ideas to create a personal gift with an artisan.",
  },
]

const HomeStory = () => (
  <>
    <section className={styles.story} aria-labelledby="home-story-title">
      <div className={styles.storyHeading}>
        <div>
          <p className={styles.eyebrow}>Behind every crochet piece</p>
          <h2 id="home-story-title" className={styles.sectionTitle}>
            Some things are beautiful
            <br />
            because they are handmade.
          </h2>
        </div>
        <p>
          Time, patience, and a love of craft go into every loop. Yarnly connects you with the people behind these little treasures.
        </p>
      </div>
      <ol className={styles.steps}>
        {makingSteps.map((step) => (
          <li key={step.number} className={styles.step}>
            <span className={styles.stepNumber}>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className={styles.custom} aria-labelledby="home-custom-title">
      <div className={styles.customImage}>
        <Image
          src="/images/yarnly-studio-yarn.webp"
          alt="Neutral yarn and knitting needles on a wooden tray in a craft corner"
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
        />
      </div>
      <div className={styles.customCopy}>
        <p className={styles.eyebrow}>Have an idea?</p>
        <h2 id="home-custom-title" className={styles.sectionTitle}>
          Your favorite colors.
          <br />
          Your perfect gift.
        </h2>
        <p>
          A bag in just the right shade, a plush friend for someone special, or a gift you haven't found anywhere. Share your idea and bring it to life with an artisan.
        </p>
        <LocalizedClientLink
          href="/account/yeu-cau-lam-rieng"
          className={styles.button}
        >
          Create your own piece <span aria-hidden="true">↗</span>
        </LocalizedClientLink>
      </div>
    </section>
    <section className={styles.maker} aria-labelledby="home-maker-title">
      <div>
        <p className={styles.eyebrow}>For those who love the craft</p>
        <h2 id="home-maker-title">A little space for talented hands.</h2>
      </div>
      <LocalizedClientLink
        href="/kenh-nghe-nhan/dang-ky"
        className={styles.textLink}
      >
        Open a Yarnly shop <span aria-hidden="true">↗</span>
      </LocalizedClientLink>
    </section>
  </>
)

export default HomeStory
