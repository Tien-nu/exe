import snapshot from "./data/vietnam-wards.json"
import { provinceCode } from "../lib/vietnam-provinces"

export type Ward = { code: string; name: string }
export function wardsForProvince(value: unknown): Ward[] | undefined {
  const code = provinceCode(value)
  return code
    ? (snapshot.provinces as Record<string, { wards: Ward[] }>)[code]?.wards
    : undefined
}
export const wardDataSource = {
  source: snapshot.source,
  fetched_at: snapshot.fetched_at,
}
