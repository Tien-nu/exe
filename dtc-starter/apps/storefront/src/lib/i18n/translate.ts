// The interface is written in English. Vietnamese visitors see it through
// vi.json: "exact" maps whole strings, "patterns" map strings with values
// ({0}, {1}). After adding or changing visible copy, run `pnpm i18n:missing`
// and add the strings it lists to vi.json.
import dictionary from "./vi.json"

export type Language = "en" | "vi"

export const LANGUAGES: Language[] = ["vi", "en"]
export const LANGUAGE_COOKIE = "yarnly_lang"

const exact = new Map<string, string>(Object.entries(dictionary.exact))

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// "Order {0}" becomes /^Order (.+?)$/; longer patterns are tried first so the
// most specific wording wins.
const patterns = dictionary.patterns
  .map(([source, template]) => ({
    regex: new RegExp(
      `^${escapeRegex(source).replace(/\\\{\d\\\}/g, "(.+?)")}$`
    ),
    template,
    weight: source.replace(/\{\d\}/g, "").length,
  }))
  .sort((a, b) => b.weight - a.weight)

const normalize = (text: string) => text.replace(/\s+/g, " ").trim()

const pad = (value: string) => value.padStart(2, "0")

/**
 * Dates and amounts are formatted for en-US across the site; Vietnamese
 * readers expect day/month order and dot thousands separators.
 */
function localizeValue(value: string): string | null {
  // formatDateTime: "11/02/2026, 09:05 PM"
  const dateTime = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),? (\d{1,2}):(\d{2})(?::\d{2})? (AM|PM)$/)
  if (dateTime) {
    const [, month, day, year, hour, minute, half] = dateTime
    const hours = (Number(hour) % 12) + (half === "PM" ? 12 : 0)
    return `${pad(day)}/${pad(month)}/${year} ${pad(String(hours))}:${minute}`
  }
  // formatDate: "11/2/2026"
  const date = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (date) return `${pad(date[2])}/${pad(date[1])}/${date[3]}`
  // formatVnd "120,000₫" and Intl currency "₫120,000"
  const amount = value.match(/^(-?)(?:₫\s?([\d,]+)|([\d,]+)\s?₫)$/)
  if (amount) return `${amount[1]}${(amount[2] ?? amount[3]).replace(/,/g, ".")}₫`
  return null
}

/** Translates one visible English string, or returns null when unknown. */
export function translate(text: string): string | null {
  const key = normalize(text)
  if (!key) return null
  const direct = exact.get(key) ?? localizeValue(key)
  if (direct !== null) return direct
  for (const pattern of patterns) {
    const match = key.match(pattern.regex)
    if (!match) continue
    return pattern.template.replace(/\{(\d)\}/g, (_, index) => {
      const value = match[Number(index) + 1] ?? ""
      return exact.get(value) ?? localizeValue(value) ?? value
    })
  }
  return null
}

/** Like translate, but keeps the whitespace around the text untouched. */
export function translateText(text: string): string | null {
  const translated = translate(text)
  if (translated === null) return null
  const leading = text.match(/^\s*/)?.[0] ?? ""
  const trailing = text.match(/\s*$/)?.[0] ?? ""
  return `${leading}${translated}${trailing}`
}
