"use server"

import { unstable_noStore as noStore } from "next/cache"
import { GET, POST, DELETE } from "../../app/api/backend/[...path]/route"

/** Server rendering uses the same authenticated handlers without an HTTP round trip. */
export async function dispatchBackend(pathname: string, method: string, headers: Record<string, string>, payload?: unknown) {
  if (process.env.NEXT_PUBLIC_YARNLY_BACKEND_MODE !== "mongodb") throw new Error("MongoDB mode is disabled")
  if (typeof pathname !== "string" || pathname.length > 12000 || !/^\/(store|auth|artisan|admin)(\/|\?|$)/.test(pathname) || pathname.includes("#")) throw new Error("Invalid API path")
  if (!["GET", "POST", "DELETE"].includes(method)) throw new Error("Invalid API method")
  noStore()
  const url = new URL(`http://yarnly-internal${pathname}`)
  // Do not trust forwarding or cookie headers supplied to a public server action.
  const safeHeaders = new Headers({ "content-type": "application/json" })
  for (const name of ["authorization", "x-medusa-locale"]) {
    const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1]
    if (typeof value === "string") safeHeaders.set(name, value)
  }
  const request = new Request(url, { method, headers: safeHeaders,
    ...(method === "POST" ? { body: JSON.stringify(payload ?? {}) } : {}) })
  const handler = method === "GET" ? GET : method === "POST" ? POST : DELETE
  const response = await handler(request, { params: Promise.resolve({ path: url.pathname.slice(1).split("/") }) })
  return { status: response.status, statusText: response.statusText, body: await response.json() }
}
