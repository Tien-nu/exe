"use client"

import { useEffect, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import styles from "@modules/landing/templates/yarnly-landing/landing-shell.module.css"

export default function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 48)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header
      className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}
    >
      <div className={styles.headerInner}>
        <LocalizedClientLink
          href="/"
          className={styles.brand}
          aria-label="Yarnly — landing page"
        >
          Yarnly
        </LocalizedClientLink>
        <nav className={styles.desktopNav} aria-label="Yarnly navigation">
          <div className={styles.navGroup}>
            <span>With Yarnly</span>
            <a href="#kham-pha">Explore</a>
            <a href="#lam-rieng">Custom made</a>
            <a href="#nghe-nhan">Artisans</a>
          </div>
          <a href="#bat-dau" className={styles.navGlass}>
            Get started
          </a>
          <LocalizedClientLink href="/account" className={styles.navGlass}>
            Account
          </LocalizedClientLink>
        </nav>
        <LocalizedClientLink href="/home" className={styles.headerCta}>
          Enter Yarnly <span aria-hidden="true">↗</span>
        </LocalizedClientLink>
        <details className={styles.mobileMenu}>
          <summary aria-label="Open menu">
            <span />
            <span />
          </summary>
          <nav aria-label="Mobile navigation">
            <a href="#kham-pha">Explore</a>
            <a href="#lam-rieng">Custom made</a>
            <a href="#nghe-nhan">For artisans</a>
            <LocalizedClientLink href="/account">Account</LocalizedClientLink>
          </nav>
        </details>
      </div>
    </header>
  )
}
