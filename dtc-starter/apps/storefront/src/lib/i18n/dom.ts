import { translateText, type Language } from "./translate"

// Attributes people read or hear (screen readers) besides text nodes.
const ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"]
// Code, user input and anything marked data-i18n-skip stay as they are.
const SKIP = "script,style,noscript,textarea,code,pre,[contenteditable=true],[data-i18n-skip]"
// Streamed sections hydrate after the shell; keep checking for up to 10s.
const RETRY_DELAY = 250
const MAX_RETRIES = 40

type Shown = { source: string; shown: string }

// React owns these nodes, so text is only ever swapped in place (never
// replaced or removed); React keeps its references and later updates still
// land on the same node. The English source is remembered for switching back.
const texts = new WeakMap<Text, Shown>()
const attributes = new WeakMap<Element, Map<string, Shown>>()

let language: Language = "en"
let observer: MutationObserver | null = null
let missed = false
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let fiberKey: string | null = null

const skipped = (element: Element | null) => !!element?.closest(SKIP)

/**
 * React compares server HTML with its own render while hydrating, so text
 * must stay English until its element is hydrated. React tags every DOM node
 * it has hydrated or created with a "__reactFiber$" property.
 */
function hydrated(element: Element) {
  if (element.ownerDocument.head.contains(element)) return true
  if (fiberKey) return Object.prototype.hasOwnProperty.call(element, fiberKey)
  fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$")) ?? null
  return fiberKey !== null
}

function sourceOf(current: string, previous: Shown | undefined) {
  // If someone else (React) changed the value since we last wrote it, the new
  // value is the new English source.
  return previous && current === previous.shown ? previous.source : current
}

function updateText(node: Text) {
  const parent = node.parentElement
  if (!parent || skipped(parent)) return
  if (language === "vi" && !hydrated(parent)) {
    missed = true
    return
  }
  const current = node.nodeValue ?? ""
  const source = sourceOf(current, texts.get(node))
  const shown = language === "vi" ? translateText(source) ?? source : source
  if (shown !== current) node.nodeValue = shown
  if (shown === source) texts.delete(node)
  else texts.set(node, { source, shown })
}

function updateAttribute(element: Element, name: string) {
  const current = element.getAttribute(name)
  const known = attributes.get(element)
  if (current === null) {
    known?.delete(name)
    return
  }
  const source = sourceOf(current, known?.get(name))
  const shown = language === "vi" ? translateText(source) ?? source : source
  if (shown !== current) element.setAttribute(name, shown)
  if (shown === source) known?.delete(name)
  else {
    const map = known ?? new Map<string, Shown>()
    map.set(name, { source, shown })
    attributes.set(element, map)
  }
}

function updateElement(element: Element) {
  const names = ATTRIBUTES.filter(
    (name) => element.hasAttribute(name) || attributes.get(element)?.has(name)
  )
  if (!names.length) return
  if (language === "vi" && !hydrated(element)) {
    missed = true
    return
  }
  for (const name of names) updateAttribute(element, name)
}

function updateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return updateText(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const element = root as Element
  if (skipped(element)) return
  updateElement(element)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(SKIP)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) updateText(node as Text)
    else updateElement(node as Element)
  }
}

/** Translates the whole page, then retries parts that were not hydrated yet. */
function pass() {
  retryTimer = null
  missed = false
  updateTree(document.documentElement)
  if (language === "vi" && missed && retries++ < MAX_RETRIES) {
    retryTimer = setTimeout(pass, RETRY_DELAY)
    return
  }
  // Everything is translated (or we gave up): reveal the page.
  delete document.documentElement.dataset.i18n
}

function onMutations(records: MutationRecord[]) {
  missed = false
  for (const record of records) {
    if (record.type === "characterData") updateText(record.target as Text)
    else if (record.type === "attributes") {
      if (!skipped(record.target as Element)) updateElement(record.target as Element)
    } else record.addedNodes.forEach(updateTree)
  }
  // Newly streamed HTML is not hydrated yet: look again shortly.
  if (missed && !retryTimer) {
    retries = 0
    retryTimer = setTimeout(pass, RETRY_DELAY)
  }
}

/**
 * Shows the page in the given language and keeps it translated while React
 * renders. Observer callbacks run before the browser paints, so updated
 * English text is never visible in Vietnamese mode.
 */
export function applyLanguage(next: Language) {
  document.documentElement.lang = next
  // An English page that was never translated needs no walk.
  if (next === "en" && language === "en" && !observer) {
    delete document.documentElement.dataset.i18n
    return
  }
  language = next
  if (retryTimer) clearTimeout(retryTimer)
  retries = 0
  pass()
  if (next === "vi" && !observer) {
    observer = new MutationObserver(onMutations)
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    })
  } else if (next === "en" && observer) {
    observer.disconnect()
    observer = null
  }
}
