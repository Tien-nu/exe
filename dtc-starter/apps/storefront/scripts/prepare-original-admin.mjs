import {
  access,
  cp,
  mkdir,
  readFile,
  writeFile,
  readdir,
} from "node:fs/promises"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
let source = fileURLToPath(
  new URL("../../backend/admin-build/", import.meta.url)
)
const englishSource = fileURLToPath(
  new URL("../../backend/admin-build-english/", import.meta.url)
)
try {
  await access(`${englishSource}/index.html`)
  source = englishSource
} catch {
  // When extensions were localized, never overwrite the localized release with
  // the historical Vietnamese baseline during a storefront-only build.
  const existing = fileURLToPath(
    new URL("../public/app/original-manifest.json", import.meta.url)
  )
  try {
    const manifest = JSON.parse(await readFile(existing, "utf8"))
    if (manifest.source === "apps/backend/admin-build-english")
      source = englishSource
  } catch {}
}
const target = fileURLToPath(new URL("../public/app/", import.meta.url))
try {
  await access(`${source}/index.html`)
} catch {
  // Vercel may deploy only the storefront root. The checked-in copy is valid
  // only when every file still matches the source manifest generated locally.
  const manifest = JSON.parse(
    await readFile(`${target}/original-manifest.json`, "utf8")
  )
  for (const [name, expected] of Object.entries(manifest.files)) {
    const actual = createHash("sha256")
      .update(await readFile(`${target}/${name}`))
      .digest("hex")
    if (actual !== expected)
      throw new Error(`Original admin checksum mismatch: ${name}`)
  }
  console.log("Verified checked-in original Medusa Admin assets")
  process.exit(0)
}
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })
const hashes = {}
for (const name of [
  "index.html",
  ...(await readdir(`${source}/assets`)).map((name) => `assets/${name}`),
])
  hashes[name] = createHash("sha256")
    .update(await readFile(`${source}/${name}`))
    .digest("hex")
await writeFile(
  new URL("../public/app/original-manifest.json", import.meta.url),
  JSON.stringify(
    {
      source:
        source === englishSource
          ? "apps/backend/admin-build-english"
          : "apps/backend/admin-build",
      files: hashes,
    },
    null,
    2
  )
)
console.log(`Medusa Admin release copied: ${Object.keys(hashes).length} files`)
