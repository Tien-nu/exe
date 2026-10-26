import type { Document } from "mongodb"
import { database } from "./mongodb"
import { ApiError, body } from "./http"
import { escapeHtml } from "./format"

const normalize = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
const fields = new Set(["id", "title", "created_at", "category", "labels", "option_values", ...["vnd", "usd", "eur"].flatMap((currency) => ["min_price", "max_price", "original_price", "on_sale"].map((key) => `${key}_${currency}`))])

export function searchDocument(product: Document): Document {
  const document: Document = { id: product.id, title: product.title, handle: product.handle, thumbnail: product.thumbnail,
    description: product.description, created_at: product.created_at,
    category: (product.categories ?? []).map((row: Document) => row.name), labels: (product.tags ?? []).map((row: Document) => row.value),
    option_values: [...new Set((product.options ?? []).flatMap((option: Document) => (option.values ?? []).map((value: Document) => `${option.title}:${value.value}`)))],
  }
  for (const currency of ["vnd", "usd", "eur"]) {
    const prices: number[] = (product.variants ?? []).flatMap((variant: Document) => (variant.prices ?? []).filter((price: Document) => price.currency_code === currency && !price.price_list_id && !price.rules_count).map((price: Document) => Number(price.amount)))
    document[`min_price_${currency}`] = prices.length ? Math.min(...prices) : null
    document[`max_price_${currency}`] = prices.length ? Math.max(...prices) : null
    document[`original_price_${currency}`] = document[`min_price_${currency}`]
    document[`on_sale_${currency}`] = false
  }
  return document
}

export function matchesFilter(document: Document, filter: unknown, depth = 0): boolean {
  if (!filter || typeof filter !== "object" || Array.isArray(filter) || depth > 8) throw new ApiError(400, "Invalid search filter")
  return Object.entries(filter).every(([field, condition]) => {
    if (field === "q") return true
    if (field === "$and" || field === "$or") {
      if (!Array.isArray(condition) || condition.length > 50) throw new ApiError(400, "Filter is too large")
      return field === "$and" ? condition.every((part) => matchesFilter(document, part, depth + 1)) : condition.some((part) => matchesFilter(document, part, depth + 1))
    }
    if (!fields.has(field)) throw new ApiError(400, "Unsupported filter field")
    const values = Array.isArray(document[field]) ? document[field] : [document[field]]
    if (condition === null || typeof condition !== "object" || Array.isArray(condition)) return values.includes(condition)
    return Object.entries(condition).every(([operator, expected]) => {
      if (["$in", "$nin"].includes(operator)) {
        if (!Array.isArray(expected) || expected.length > 100) throw new ApiError(400, "Invalid filter")
        const match = values.some((value: unknown) => expected.includes(value))
        return operator === "$in" ? match : !match
      }
      if (operator === "$eq") return values.includes(expected)
      if (operator === "$ne") return !values.includes(expected)
      if (!["$lt", "$lte", "$gt", "$gte"].includes(operator) || typeof expected !== "number" || !Number.isFinite(expected)) throw new ApiError(400, "Unsupported filter operator")
      return values.some((value: unknown) => typeof value === "number" && (operator === "$lt" ? value < expected : operator === "$lte" ? value <= expected : operator === "$gt" ? value > expected : value >= expected))
    })
  })
}

function wordMatch(word: string, candidate: string, fuzzy: boolean) {
  if (candidate.startsWith(word)) return true
  if (!fuzzy || word.length < 5 || Math.abs(word.length - candidate.length) > 1) return false
  const row = Array.from({ length: candidate.length + 1 }, (_, index) => index)
  for (let i = 1; i <= word.length; i++) {
    let diagonal = row[0]; row[0] = i
    for (let j = 1; j <= candidate.length; j++) {
      const previous = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + Number(word[i - 1] !== candidate[j - 1]))
      diagonal = previous
    }
  }
  return row[candidate.length] <= 1
}

export function runSearch(documents: Document[], query: Document) {
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new ApiError(400, "Invalid query")
  if (query.entity !== "product") throw new ApiError(400, "Only product search is supported")
  const take = query.pagination?.take ?? 20, skip = query.pagination?.skip ?? 0
  if (!Number.isSafeInteger(take) || take < 0 || take > 100 || !Number.isSafeInteger(skip) || skip < 0 || skip > 100_000) throw new ApiError(400, "Invalid pagination")
  const filter = query.filters ?? {}, options = query.search_options ?? {}
  if (!filter || typeof filter !== "object" || Array.isArray(filter) || !options || typeof options !== "object" || Array.isArray(options)) throw new ApiError(400, "Invalid query")
  const text = String(filter.q ?? "")
  if (text.length > 200) throw new ApiError(400, "Search term is too long")
  const words = normalize(text).split(/\s+/).filter(Boolean).slice(0, 10)
  const matched = documents.filter((document) => matchesFilter(document, filter)).map((document) => {
    const title = normalize(document.title), optionText = normalize(document.option_values.join(" "))
    const all = `${title} ${normalize(document.description)} ${optionText}`.split(/\s+/)
    const matches = words.every((word) => all.some((candidate) => wordMatch(word, candidate, options.typo_tolerance !== false)))
    return { document, matches, score: words.reduce((sum, word) => sum + (title.includes(word) ? 3 : optionText.includes(word) ? 2 : 1), 0) }
  }).filter((hit) => hit.matches).sort((a, b) => b.score - a.score || +new Date(b.document.created_at) - +new Date(a.document.created_at))
  const order = query.pagination?.order
  if (order !== undefined) {
    if (!order || typeof order !== "object" || Array.isArray(order) || Object.keys(order).length > 5) throw new ApiError(400, "Invalid search order")
    for (const [field, direction] of Object.entries(order)) if (!fields.has(field) || !["ASC", "DESC"].includes(String(direction))) throw new ApiError(400, "Unsupported search order")
    matched.sort((a, b) => {
      for (const [field, direction] of Object.entries(order)) {
        const left = a.document[field], right = b.document[field]
        const difference = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""), "vi")
        if (difference) return direction === "DESC" ? -difference : difference
      }
      return String(a.document.id).localeCompare(String(b.document.id))
    })
  }
  const facets: Document = {}
  if (options.facets !== undefined && (!Array.isArray(options.facets) || options.facets.length > 30)) throw new ApiError(400, "Invalid facet request")
  for (const facet of options.facets ?? []) {
    if (!facet || typeof facet !== "object" || !fields.has(facet.field)) throw new ApiError(400, "Unsupported facet")
    const all = matched.flatMap((hit) => Array.isArray(hit.document[facet.field]) ? [...new Set(hit.document[facet.field])] : [hit.document[facet.field]]).filter((value) => value != null)
    if (facet.type === "stats") {
      const numbers = all.filter((value) => typeof value === "number") as number[]
      facets[facet.field] = { type: "stats", min: numbers.length ? Math.min(...numbers) : 0, max: numbers.length ? Math.max(...numbers) : 0,
        sum: numbers.reduce((sum, value) => sum + value, 0), avg: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0 }
    } else {
      const counts = new Map<string, number>()
      for (const value of all) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1)
      const limit = facet.limit ?? 100
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "Invalid facet limit")
      facets[facet.field] = { type: "value", values: [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => facet.sort === "alpha" ? a.value.localeCompare(b.value, "vi") : b.count - a.count).slice(0, limit) }
    }
  }
  return { hits: matched.slice(skip, skip + take).map((hit) => ({ id: hit.document.id, document: hit.document, score: hit.score,
    highlights: { title: [escapeHtml(hit.document.title)] } })), facets,
    metadata: { count: matched.length, take, skip, query: text, processing_time_ms: 0 } }
}

export async function search(request: Request) {
  const input = await body(request)
  const queries = Array.isArray(input.queries) ? input.queries : [input]
  if (queries.length > 20) throw new ApiError(400, "Too many search queries")
  const db = await database()
  const products = await db.collection("products").find({ status: "published", deleted_at: null }).limit(5001).toArray()
  if (products.length > 5000) throw new ApiError(503, "The catalog requires a dedicated search index")
  const documents = products.map(searchDocument)
  return { results: queries.map((query) => runSearch(documents, query)) }
}
