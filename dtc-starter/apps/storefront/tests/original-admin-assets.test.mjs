import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"

test("served Medusa Admin assets match the verified localized release", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/app/original-manifest.json", import.meta.url),
      "utf8"
    )
  )
  assert.equal(manifest.source, "apps/backend/admin-build-english")
  assert.ok(Object.keys(manifest.files).length > 300)
  for (const [file, expected] of Object.entries(manifest.files)) {
    const served = await readFile(
      new URL(`../public/app/${file}`, import.meta.url)
    )
    assert.equal(
      createHash("sha256").update(served).digest("hex"),
      expected,
      file
    )
  }
  const original = await readFile(
    new URL("../../backend/admin-build/index.html", import.meta.url),
    "utf8"
  )
  assert.ok(original.includes('id="medusa"'))
  const localized = await readFile(
    new URL("../public/app/index.html", import.meta.url),
    "utf8"
  )
  assert.ok(localized.includes('id="medusa"'))
})
