"use client"

import { applyLanguage } from "@lib/i18n/dom"
import { currentLanguage } from "@lib/i18n/language"
import { useEffect } from "react"

/**
 * Starts translating once the root has hydrated; sections React hydrates
 * later are picked up as they become ready.
 */
export default function LanguageRuntime() {
  useEffect(() => {
    applyLanguage(currentLanguage())
  }, [])

  return null
}
