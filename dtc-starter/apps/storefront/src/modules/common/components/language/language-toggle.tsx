"use client"

import { setLanguage, useLanguage } from "@lib/i18n/language"
import type { Language } from "@lib/i18n/translate"
import { clx } from "@modules/common/components/ui"

const OPTIONS: { code: Language; label: string; name: string }[] = [
  { code: "vi", label: "VI", name: "Vietnamese" },
  { code: "en", label: "EN", name: "English" },
]

/**
 * VI | EN switch. Colours follow the surrounding text colour, so it fits
 * light headers and the white-on-video landing header alike.
 */
export default function LanguageToggle({ className }: { className?: string }) {
  const language = useLanguage()

  return (
    <div
      role="group"
      aria-label="Language"
      className={clx(
        "inline-flex h-8 shrink-0 items-center rounded-full border p-0.5 text-[11px] font-medium leading-none tracking-[0.08em]",
        className
      )}
      style={{ borderColor: "color-mix(in srgb, currentColor 28%, transparent)" }}
    >
      {OPTIONS.map((option) => {
        const active = language === option.code

        return (
          <button
            key={option.code}
            type="button"
            lang={option.code}
            title={option.name}
            aria-pressed={active}
            onClick={() => setLanguage(option.code)}
            className={clx(
              "h-full rounded-full px-2.5 transition-[background-color,opacity]",
              !active && "opacity-60 hover:opacity-100"
            )}
            style={
              active
                ? { backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" }
                : undefined
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
