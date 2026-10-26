import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

// Route handles and actual Vietnamese geography are data, not interface copy.
const preserved = new Set(["quà-tặng-ý-nghĩa", "phụ-kiện-xinh"])
const vietnamese =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

test("interface and server messages use English while geographic data and catalog handles are preserved", () => {
  const remaining = []
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        scan(path)
        continue
      }
      if (!/\.tsx?$/.test(path) || path.endsWith("vietnam-provinces.ts"))
        continue
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true
      )
      function visit(node) {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isJsxText(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)
        ) {
          const text = node.text.trim()
          if (vietnamese.test(text) && !preserved.has(text))
            remaining.push({ path, text })
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  scan(new URL("../src", import.meta.url).pathname)
  scan(new URL("../../backend/src/admin", import.meta.url).pathname)
  assert.deepEqual(remaining, [])
  assert.match(
    readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
    /lang="en"/
  )
})
