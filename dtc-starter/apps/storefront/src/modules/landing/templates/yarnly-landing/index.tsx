import Image from "next/image"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import FeatureSections from "@modules/landing/components/feature-sections"
import LandingHeader from "@modules/landing/components/landing-header"
import PixelIcon from "@modules/landing/components/pixel-icon"
import PixelLandscape from "@modules/landing/components/pixel-landscape"
import styles from "./yarnly-landing.module.css"
import shell from "./landing-shell.module.css"

const categories = [
  { name: "Plush toys", icon: "heart" as const },
  { name: "Accessories", icon: "yarn" as const },
  { name: "Crochet flowers", icon: "flower" as const },
  { name: "Custom gifts", icon: "gift" as const },
]

const products = [
  {
    name: "Crochet teddy bear",
    image: "/images/crochet_bear.png",
    note: "Small, soft, and sweet",
  },
  {
    name: "Handmade crochet flowers",
    image: "/images/cuu_hoa_len.jpg",
    note: "A lasting gift",
  },
  {
    name: "Flower keychain",
    image: "/images/moc_khoa.jpg",
    note: "A little gentleness to carry",
  },
]

const chapters = [
  {
    number: "01",
    name: "Find a piece",
    note: "Explore handmade crochet",
    href: "/store",
    icon: "yarn" as const,
  },
  {
    number: "02",
    name: "Meet the makers",
    note: "Visit the shops",
    href: "/nghe-nhan",
    icon: "heart" as const,
  },
  {
    number: "03",
    name: "Create a custom piece",
    note: "Share your idea",
    href: "/account/yeu-cau-lam-rieng",
    icon: "gift" as const,
  },
  {
    number: "04",
    name: "Open a shop",
    note: "Tell your story in yarn",
    href: "/kenh-nghe-nhan/dang-ky",
    icon: "flower" as const,
  },
]

function PixelEdge({ top = false }: { top?: boolean }) {
  return (
    <svg
      className={top ? shell.pixelEdgeTop : shell.pixelEdge}
      viewBox="0 0 1200 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 10h12V3h9v12h15V8h8V0h8v12h15V6h12v9h18V2h9v8h14v7h15V6h10v8h20V3h7v9h23v5h15V2h9v13h20V7h9v5h23V2h8v14h22V7h15v6h19V1h8v9h25v6h13V4h9v9h24V2h8v14h21V5h13v7h25V1h8v13h22V6h13v10h20V3h8v9h25V6h12v9h20V1h8v10h23v5h15V4h8v9h25V2h8v14h20V5h13v8h24V1h8v10h23v5h14V4h9v9h24V2h8v14h20V5h13v7h25V1h8v13h22V6h13v10h20V3h8v9h25V6h12v9h20V1h8v10h23v5h15V4h8v9h25V2h8v14h20V5h13v8h24V1h8v10h23v9H0z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function YarnlyLanding() {
  return (
    <div className={styles.page}>
      <LandingHeader />

      <section className={shell.hero} aria-labelledby="landing-title">
        <PixelLandscape />
        <div className={shell.heroShade} />
        <div className={shell.heroInner}>
          <h1 id="landing-title">
            Yarnly connects you to
            <br className={styles.desktopBreak} /> a world of handmade crochet.
          </h1>
          <p>
            From a piece you love to the artisan who made it.
            <br className={styles.desktopBreak} /> Explore, connect, and create something special together.
          </p>
          <div className={styles.actions}>
            <LocalizedClientLink href="/home" className={styles.lightButton}>
              Explore Yarnly <span aria-hidden="true">↗</span>
            </LocalizedClientLink>
            <a href="#cau-chuyen" className={styles.glassButton}>
              Our story
            </a>
          </div>
        </div>
        <PixelEdge />
      </section>

      <section
        className={styles.categoryStrip}
        aria-label="The pieces on Yarnly"
      >
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <LocalizedClientLink
              key={category.name}
              href="/store"
              className={styles.categoryTile}
            >
              <PixelIcon kind={category.icon} />
              <span>{category.name}</span>
            </LocalizedClientLink>
          ))}
        </div>
        <p>Little crochet pieces. Stories of their own.</p>
      </section>

      <section
        id="cau-chuyen"
        className={styles.overview}
        aria-labelledby="overview-title"
      >
        <h2 id="overview-title" className={styles.centerHeading}>
          Yarnly is where handmade lovers
          <br />
          <span>meet the hands behind something special.</span>
        </h2>
        <div className={styles.workspace}>
          <div className={styles.workspaceBar}>
            <span className={styles.miniBrand}>Yarnly</span>
            <span>A corner of the handmade world</span>
            <LocalizedClientLink href="/store">
              Explore all ↗
            </LocalizedClientLink>
          </div>
          <div className={styles.workspaceBody}>
            <div className={styles.productGallery}>
              <div className={styles.galleryHeading}>
                <span>Made by real hands</span>
                <span>Plush toys · Flowers · Accessories</span>
              </div>
              <div className={styles.productGrid}>
                {products.map((product) => (
                  <LocalizedClientLink
                    href="/store"
                    key={product.name}
                    className={styles.productCard}
                  >
                    <div className={styles.productImage}>
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 680px) 42vw, 22vw"
                      />
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.note}</p>
                  </LocalizedClientLink>
                ))}
              </div>
            </div>
            <aside className={styles.makerNote}>
              <PixelIcon kind="flower" />
              <p>
                Every product starts
                <br />
                with a passionate maker.
              </p>
              <span>
                Discover the shops, explore their styles, and choose a piece with its maker's personal touch.
              </span>
              <LocalizedClientLink href="/nghe-nhan">
                Meet the artisans <span aria-hidden="true">↗</span>
              </LocalizedClientLink>
            </aside>
          </div>
        </div>
        <div className={styles.overviewBenefits}>
          <p>
            <PixelIcon kind="yarn" />
            <span>
              <strong>Handmade, piece by piece</strong> — Every stitch holds time, patience, and the maker's personality.
            </span>
          </p>
          <p>
            <PixelIcon kind="heart" />
            <span>
              <strong>A closer connection</strong> — Meet the person behind the product and visit their shop.
            </span>
          </p>
          <p>
            <PixelIcon kind="gift" />
            <span>
              <strong>Made just for you</strong> — Share ideas, colors, and details to create a gift of your own.
            </span>
          </p>
        </div>
        <div className={styles.smallCta}>
          <h3>Start with a piece you love.</h3>
          <p>Visit Yarnly and find a little gentleness for everyday life.</p>
          <LocalizedClientLink href="/home" className={styles.darkButton}>
            Enter Yarnly <span aria-hidden="true">↗</span>
          </LocalizedClientLink>
        </div>
      </section>

      <section className={styles.capabilities}>
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>WHAT YARNLY BRINGS YOU</p>
          <h2>
            Find a piece you love.
            <br />
            <span>Meet the person who made it.</span>
          </h2>
          <p>
            From exploring products to custom requests, every step brings you
            <br className={styles.desktopBreak} /> closer to the world of handmade crochet.
          </p>
        </div>
        <FeatureSections />
      </section>

      <section id="bat-dau" className={styles.chaptersSection}>
        <div className={styles.sectionIntro}>
          <h2>Start with what you love.</h2>
          <p>A gift, a connection, or a shop of your own.</p>
          <LocalizedClientLink href="/home" className={styles.darkButton}>
            Explore together <span aria-hidden="true">↗</span>
          </LocalizedClientLink>
        </div>
        <div className={styles.chapterGrid}>
          {chapters.map((chapter) => (
            <LocalizedClientLink
              key={chapter.number}
              href={chapter.href}
              className={styles.chapterCard}
            >
              <div className={styles.chapterTop}>
                <span>CHAPTER {chapter.number}</span>
                <span>YARNLY</span>
              </div>
              <h3>{chapter.name}</h3>
              <PixelIcon kind={chapter.icon} />
              <div className={styles.chapterBottom}>
                <span>{chapter.note}</span>
                <span aria-hidden="true">↗</span>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </section>

      <section className={styles.craftSection}>
        <div className={styles.craftCopy}>
          <p className={styles.eyebrow}>TAKE A LITTLE MORE TIME</p>
          <h2>
            Beautiful because someone
            <br />
            made it.
          </h2>
          <p>
            Handmade pieces hold their entire journey. Every loop, color change, and finishing touch becomes part of the story.
          </p>
          <details open>
            <summary>
              See the care<span aria-hidden="true">+</span>
            </summary>
            <p>
              A piece may be small, but finishing it takes time and patience.
            </p>
          </details>
          <details>
            <summary>
              Appreciate the makers<span aria-hidden="true">+</span>
            </summary>
            <p>
              Visit the shops and discover each artisan's distinctive touch.
            </p>
          </details>
          <details>
            <summary>
              Keep a gift for longer<span aria-hidden="true">+</span>
            </summary>
            <p>
              Choose a piece connected to a story, a favorite thing, or someone you want to surprise.
            </p>
          </details>
        </div>
        <figure className={styles.craftVideo}>
          <video
            autoPlay
            muted
            loop
            disablePictureInPicture
            playsInline
            preload="metadata"
            poster="/images/crochet_bear.png"
            aria-label="Crocheting by hand"
          >
            <source
              src="https://videos.pexels.com/video-files/7578126/7578126-hd_1080_1920_24fps.mp4"
              type="video/mp4"
            />
            Your browser does not support video.
          </video>
          <figcaption>
            A little peace in every stitch.
            <a
              href="https://www.pexels.com/video/woman-doing-crochet-7578126/"
              target="_blank"
              rel="noreferrer"
            >
              Miriam Alonso / Pexels ↗
            </a>
          </figcaption>
        </figure>
      </section>

      <section className={styles.wordSection}>
        <h2>Handmade crochet for everyday moments.</h2>
        <p>
          A little gift, a lovely accessory, or a crochet companion.
          <br />
          A story can always start here.
        </p>
        <div className={styles.wordGrid} aria-hidden="true">
          {[
            "QWERTYUIOPASDFGHJK",
            "MNYARNLYBCXZLKJHGF",
            "ASDFGHJKLQWERTYUIO",
            "POIUHANDMADEYTREWQ",
            "ZXCVBNMASDFGHJKLPO",
            "ASQUATANGDFGHJKLZX",
            "QWERTYUIOPASDFGHJK",
          ].flatMap((line, row) =>
            line
              .slice(0, 18)
              .split("")
              .map((letter, col) => (
                <span
                  key={row + "-" + col}
                  className={
                    (row === 1 && col >= 2 && col < 8) ||
                    (row === 3 && col >= 4 && col < 12) ||
                    (row === 5 && col >= 2 && col < 9)
                      ? styles.wordHighlight
                      : undefined
                  }
                >
                  {letter}
                </span>
              ))
          )}
        </div>
      </section>

      <footer className={shell.footer}>
        <PixelLandscape variant="footer" />
        <div className={shell.footerShade} />
        <PixelEdge top />
        <div className={shell.footerInner}>
          <h2>
            A little crochet piece.
            <br />
            A story of your own.
          </h2>
          <LocalizedClientLink href="/home" className={styles.lightButton}>
            Explore Yarnly <span aria-hidden="true">↗</span>
          </LocalizedClientLink>
          <div className={shell.footerBottom}>
            <div>
              <LocalizedClientLink href="/" className={shell.brand}>
                Yarnly
              </LocalizedClientLink>
              <p>
                Where handmade crochet lovers
                <br />
                meet Vietnamese artisans.
              </p>
            </div>
            <nav aria-label="Footer links">
              <LocalizedClientLink href="/home">Home</LocalizedClientLink>
              <LocalizedClientLink href="/store">Products</LocalizedClientLink>
              <LocalizedClientLink href="/nghe-nhan">
                Artisans
              </LocalizedClientLink>
              <LocalizedClientLink href="/kenh-nghe-nhan/dang-ky">
                Open a shop
              </LocalizedClientLink>
              <LocalizedClientLink href="/account">
                Account
              </LocalizedClientLink>
            </nav>
          </div>
          <div className={shell.copyright}>
            <span>© {new Date().getFullYear()} Yarnly</span>
            <span>Connected by stitches.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
