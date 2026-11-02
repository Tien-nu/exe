// Lists interface copy that has no Vietnamese translation in
// src/lib/i18n/vi.json. Run after adding or changing visible text:
//   pnpm i18n:missing
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { translate } from "../src/lib/i18n/translate.ts"

// Props and object keys whose string values end up on screen.
const VISIBLE_PROPS =
  /^(label|title|hint|description|message|placeholder|alt|aria-label|eyebrow|confirmText|cancelText|status_label)$/

const decode = (text) =>
  text
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&hellip;/g, "…")
    .replace(/&amp;/g, "&")

// Server folders hold API messages; skip developer-only files.
const skipFile = (path) =>
  /vietnam-provinces\.ts$|email-templates\.ts$|outbox\.ts$|original-admin\.ts$|admin-fulfillment\.ts$|\.d\.ts$/.test(
    path
  )

const isCopy = (text) =>
  /[A-Za-z]{2,}/.test(text) &&
  !/^[\w./:#?=&%@-]+$/.test(text) &&
  !/\b(flex|grid|px-|py-|text-|bg-|border|rounded|items-|gap-|small:|hover:|txt-)/.test(text)

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (/\.tsx?$/.test(path) && !skipFile(path)) yield path
  }
}

const missing = new Map()
for (const path of files(new URL("../src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true)
  const report = (node, text) => {
    const value = decode(text).replace(/\s+/g, " ").trim()
    if (!isCopy(value) || translate(value) !== null || missing.has(value)) return
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    missing.set(value, `${path.replace(/.*[\\/]src[\\/]/, "src/")}:${line + 1}`)
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    else if (ts.isStringLiteral(node) && node.parent) {
      const parent = node.parent
      const name = ts.isJsxAttribute(parent) || ts.isPropertyAssignment(parent) ? parent.name.getText().replace(/["']/g, "") : ""
      if (VISIBLE_PROPS.test(name)) report(node, node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

for (const [text, where] of missing) console.log(`${where}\t${text}`)
console.log(`\n${missing.size} strings without a Vietnamese translation`)
