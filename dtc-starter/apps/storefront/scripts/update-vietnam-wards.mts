import { readFile, writeFile } from "node:fs/promises"
import {
  provinceCode,
  provinceName,
  VIETNAM_PROVINCES,
} from "../src/lib/vietnam-provinces.ts"

// Fetch once when refreshing the checked-in snapshot, never during checkout.
const source = "https://provinces.open-api.vn/api/v2/?depth=2"
const rows = process.argv[2]
  ? JSON.parse(await readFile(process.argv[2], "utf8"))
  : await fetch(source, { signal: AbortSignal.timeout(20000) }).then(
      (response) => {
        if (!response.ok)
          throw new Error(`Province source HTTP ${response.status}`)
        return response.json()
      }
    )
const provinces: Record<
  string,
  { code: number; name: string; wards: { code: string; name: string }[] }
> = {}
const wardCodes = new Set<string>()
for (const row of rows) {
  const canonical = provinceCode(row.name)
  if (
    !canonical ||
    provinces[canonical] ||
    !Array.isArray(row.wards) ||
    !row.wards.length
  )
    throw new Error("Invalid province snapshot")
  provinces[canonical] = {
    code: row.code,
    name: provinceName(row.name)!,
    wards: row.wards
      .map((ward: { code: number; name: string }) => {
        const code = String(ward.code).padStart(5, "0")
        if (
          !/^\d{5}$/.test(code) ||
          typeof ward.name !== "string" ||
          !ward.name ||
          wardCodes.has(code)
        )
          throw new Error("Invalid ward snapshot")
        wardCodes.add(code)
        return { code, name: ward.name }
      })
      .sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name, "vi")
      ),
  }
}
if (Object.keys(provinces).length !== VIETNAM_PROVINCES.length)
  throw new Error("Incomplete province snapshot")
await writeFile(
  new URL("../src/server/data/vietnam-wards.json", import.meta.url),
  JSON.stringify({ source, fetched_at: new Date().toISOString(), provinces }) +
    "\n"
)
console.log(
  `Saved ${Object.keys(provinces).length} provinces and ${wardCodes.size} wards`
)
