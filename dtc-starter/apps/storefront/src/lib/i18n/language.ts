import { useSyncExternalStore } from "react"
import { applyLanguage } from "./dom"
import { LANGUAGE_COOKIE, type Language } from "./translate"

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const currentLanguage = (): Language =>
  document.documentElement.dataset.lang === "vi" ? "vi" : "en"

export function setLanguage(next: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  document.documentElement.dataset.lang = next
  applyLanguage(next)
  listeners.forEach((listener) => listener())
}

/** The visitor's language; "en" while server rendering and hydrating. */
export const useLanguage = () =>
  useSyncExternalStore(subscribe, currentLanguage, () => "en" as Language)
