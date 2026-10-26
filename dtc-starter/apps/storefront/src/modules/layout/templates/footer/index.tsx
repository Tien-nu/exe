import { listCollections } from "@lib/data/collections"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import styles from "./footer.module.css"

export default async function Footer() {
  const { collections } = await listCollections({
    fields: "id,handle,title",
  })

  return (
    <footer className={styles.footer} aria-label="Yarnly footer">
      <div className={styles.container}>
        <div className={styles.columns}>
          <div className={styles.brand}>
            <LocalizedClientLink href="/" className={styles.wordmark}>
              Yarnly<span aria-hidden="true">.</span>
            </LocalizedClientLink>
            <p>
              Where little stitches
              <br />
              connect bigger stories.
            </p>
            <span className={styles.brandNote}>Handmade crochet from Vietnam</span>
          </div>

          <nav aria-labelledby="footer-explore-title">
            <h2 id="footer-explore-title" className={styles.heading}>
              Explore
            </h2>
            <ul className={styles.links}>
              <li>
                <LocalizedClientLink href="/store">
                  All products
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/nghe-nhan">
                  Meet the artisans
                </LocalizedClientLink>
              </li>
              {collections?.slice(0, 4).map((collection) => (
                <li key={collection.id}>
                  <LocalizedClientLink
                    href={`/collections/${collection.handle}`}
                  >
                    {collection.title}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-yarnly-title">
            <h2 id="footer-yarnly-title" className={styles.heading}>
              With Yarnly
            </h2>
            <ul className={styles.links}>
              <li>
                <LocalizedClientLink href="/">
                  The Yarnly story
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/account">
                  Your account
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/account/yeu-cau-lam-rieng">
                  Custom requests
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/kenh-nghe-nhan/dang-ky">
                  Open a shop
                </LocalizedClientLink>
              </li>
            </ul>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p>© {new Date().getFullYear()} Yarnly.</p>
          <p>Made by hand. Sent with love.</p>
        </div>
      </div>
    </footer>
  )
}
