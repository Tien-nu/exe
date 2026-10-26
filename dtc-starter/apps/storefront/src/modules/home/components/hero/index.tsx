import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "./hero.module.css"

const Hero = () => (
  <section className={styles.hero} aria-labelledby="home-title">
    <video
      className={styles.video}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      preload="auto"
      poster="/images/yarnly-crochet-film-poster.webp"
      aria-label="An artisan crocheting each stitch by hand"
    >
      <source src="/videos/yarnly-crochet-workshop.mp4" type="video/mp4" />
    </video>
    <div className={styles.shade} aria-hidden="true" />
    <div className={styles.content}>
      <p className={styles.eyebrow}>Yarnly / A world of handmade crochet</p>
      <h1 id="home-title" className={styles.title}>
        Little crochet pieces.
        <br />
        Made with so much love.
      </h1>
      <p className={styles.description}>
        Thoughtfully made to be loved for years. Find a piece you love and meet the artisan behind it.
      </p>
      <div className={styles.actions}>
        <a href="#san-pham" className={styles.button}>
          Explore the collection <span aria-hidden="true">↗</span>
        </a>
        <LocalizedClientLink href="/nghe-nhan" className={styles.secondary}>
          Meet the makers <span aria-hidden="true">↗</span>
        </LocalizedClientLink>
      </div>
    </div>
  </section>
)

export default Hero
