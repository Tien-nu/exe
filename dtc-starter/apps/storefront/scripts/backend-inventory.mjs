import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const backend = resolve(root, "apps/backend/src")

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat().sort()
}

const routes = []
for (const file of await files(resolve(backend, "api"))) {
  if (!file.endsWith("/route.ts")) continue
  const source = await readFile(file, "utf8")
  const path = "/" + relative(resolve(backend, "api"), file).replace(/\/route.ts$/, "").replace(/\[([^\]]+)\]/g, ":$1")
  for (const method of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|DELETE|PUT|PATCH)\b/g)) {
    routes.push({ method: method[1], path, source: relative(root, file),
      sha256: createHash("sha256").update(source).digest("hex"), migrated: false })
  }
}

const models = []
for (const file of await files(resolve(backend, "modules/marketplace/models"))) {
  const source = await readFile(file, "utf8")
  models.push({ source: relative(root, file), sha256: createHash("sha256").update(source).digest("hex") })
}

const sdkCalls = []
for (const file of await files(resolve(root, "apps/storefront/src/lib/data"))) {
  if (!file.endsWith(".ts")) continue
  const source = await readFile(file, "utf8")
  for (const match of source.matchAll(/sdk\.(?:store\.[a-zA-Z]+|auth(?:\.verification)?)\s*\.\s*([a-zA-Z]+)/g)) {
    sdkCalls.push({ call: match[0].replace(/\s+/g, ""), source: relative(root, file) })
  }
}

const output = resolve(root, "migration/backend-inventory.json")
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({
  baseline: "Yarnly_deploy/dtc-starter",
  note: "Custom routes only. Medusa built-in APIs and the admin UI must be tested separately. migrated=false is deliberate until integration tests pass.",
  routes, models, sdkCalls,
}, null, 2) + "\n")
console.log(`Inventoried ${routes.length} custom method/path pairs, ${models.length} models and ${sdkCalls.length} SDK usages.`)
