import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput, FetchError } from "@medusajs/js-sdk"

import qs from "qs"
import { dispatchBackend } from "./data/backend-dispatch"
import { backendUrl } from "./backend-url"

export const sdk = new Medusa({
  baseUrl: backendUrl(),
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

const originalFetch = sdk.client.fetch.bind(sdk.client)

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
  let localeHeader: Record<string, string | null> | undefined
  try {
    localeHeader = await getLocaleHeader()
    headers["x-medusa-locale"] ??= localeHeader["x-medusa-locale"]
  } catch {}

  const newHeaders = {
    ...localeHeader,
    ...headers,
  }
  init = {
    ...init,
    headers: newHeaders,
  }
  if (process.env.NEXT_PUBLIC_YARNLY_BACKEND_MODE === "mongodb" && typeof window === "undefined") {
    if (typeof input !== "string") throw new Error("API path must be a string")
    const query = qs.stringify(init.query, { arrayFormat: "brackets", skipNulls: true })
    const pathname = query ? `${input}${input.includes("?") ? "&" : "?"}${query}` : input
    const response = await dispatchBackend(pathname, init.method ?? "GET", newHeaders as Record<string, string>, init.body)
    if (response.status < 200 || response.status >= 300) throw new FetchError(response.body.message, response.statusText, response.status)
    return response.body as T
  }
  return originalFetch(input, init)
}
