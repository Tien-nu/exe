"use server"

import { sdk } from "@lib/config"
import type {
  Artisan,
  ArtisanDashboard,
  ArtisanProduct,
  ArtisanSubOrder,
  CustomRequest,
  Payout,
} from "@lib/marketplace-types"
import { cookies as nextCookies } from "next/headers"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"

const TOKEN_COOKIE = "_yarnly_artisan_jwt"

// `values` echoes what was typed (never the password): React resets the form
// after an action, and the fields fall back to these as their defaults.
export type FormState = {
  error: string | null
  success?: boolean
  values?: Record<string, string>
} | null

const toError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function setToken(token: string) {
  const cookies = await nextCookies()
  cookies.set(TOKEN_COOKIE, token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

async function authHeaders(): Promise<Record<string, string>> {
  const cookies = await nextCookies()
  const token = cookies.get(TOKEN_COOKIE)?.value
  return token ? { authorization: `Bearer ${token}` } : {}
}

// Product data only changes through this portal (or an admin locking the
// shop), so it is cached per artisan (the token is part of the cache key)
// and dropped as soon as the artisan saves, deletes or adds a product.
const PRODUCTS_TAG = "artisan-products"
const productsCache = { next: { tags: [PRODUCTS_TAG], revalidate: 60 } }

/** Calls the artisan API with the artisan's token; uncached unless `cached`. */
async function artisanFetch<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "DELETE"
    body?: unknown
    cached?: { next: { tags?: string[]; revalidate: number } }
  } = {}
): Promise<T> {
  return sdk.client.fetch<T>(`/artisan${path}`, {
    method: init.method ?? "GET",
    headers: await authHeaders(),
    body: init.body as Record<string, unknown> | undefined,
    ...(init.cached ?? { cache: "no-store" as const }),
  })
}

const authToken = (email: string, password: string, action: "" | "/register") =>
  sdk.client
    .fetch<{ token: string }>(`/auth/artisan/emailpass${action}`, {
      method: "POST",
      body: { email, password },
    })
    .then(({ token }) => token)

// ---- Auth -----------------------------------------------------------------

export async function artisanLogin(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const countryCode = String(formData.get("country_code") ?? "vn")

  try {
    await setToken(await authToken(email, password, ""))
    // Accounts without a shop get a token too; make sure this one has one.
    await artisanFetch("/me")
  } catch {
    return {
      error: "Incorrect email or password, or this account has no shop",
      values: { email },
    }
  }

  redirect(`/${countryCode}/kenh-nghe-nhan`)
}

const PROFILE_FIELDS = [
  "shop_name",
  "full_name",
  "phone",
  "description",
  "pickup_address",
  "pickup_province_name",
  "pickup_district_id",
  "pickup_district_name",
  "pickup_ward_code",
  "pickup_ward_name",
  "bank_name",
  "bank_account_number",
  "bank_account_name",
] as const

// Empty optional fields are dropped so the API keeps its "not set" meaning.
const readProfile = (formData: FormData) =>
  Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, String(formData.get(field) ?? "").trim()]).filter(
      ([field, value]) => value !== "" || !String(field).startsWith("pickup_") || field === "pickup_address"
    )
  )

export async function artisanRegister(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const countryCode = String(formData.get("country_code") ?? "vn")
  const values = { email, ...readProfile(formData) }

  if (password.length < 8) {
    return { error: "Password must contain at least 8 characters", values }
  }

  let token: string

  try {
    token = await authToken(email, password, "/register")
  } catch {
    // The email may already log in as a customer: reuse that identity.
    try {
      token = await authToken(email, password, "")
    } catch {
      return {
        error: "This email is already registered. Enter its existing password or use another email address.",
        values,
      }
    }
  }

  try {
    await sdk.client.fetch(`/artisan/register`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: values,
    })
    // Log in again so the token carries the new artisan id.
    await setToken(await authToken(email, password, ""))
  } catch (error) {
    return { error: toError(error), values }
  }

  redirect(`/${countryCode}/kenh-nghe-nhan`)
}

export async function artisanLogout(countryCode: string) {
  const cookies = await nextCookies()
  cookies.set(TOKEN_COOKIE, "", { maxAge: -1 })
  redirect(`/${countryCode}/kenh-nghe-nhan/dang-nhap`)
}

/** The logged-in artisan, or null. Works while the shop is pending too. */
export async function getArtisanMe(): Promise<Artisan | null> {
  const headers = await authHeaders()

  if (!headers.authorization) {
    return null
  }

  return artisanFetch<{ artisan: Artisan }>("/me")
    .then(({ artisan }) => artisan)
    .catch(() => null)
}

export async function updateArtisanProfile(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const values = readProfile(formData)

  try {
    await artisanFetch("/me", { method: "POST", body: values })
    return { error: null, success: true, values }
  } catch (error) {
    return { error: toError(error), values }
  }
}

// ---- Reads ------------------------------------------------------------------
// Reads return empty values on failure: the portal layout already shows why a
// pending or locked shop cannot use the pages rendered next to it.

export async function getArtisanDashboard() {
  return artisanFetch<ArtisanDashboard>("/dashboard").catch(() => null)
}

export async function listArtisanProducts() {
  return artisanFetch<{ products: ArtisanProduct[] }>("/products", { cached: productsCache })
    .then(({ products }) => products)
    .catch(() => [] as ArtisanProduct[])
}

export async function getArtisanProduct(id: string) {
  return artisanFetch<{ product: ArtisanProduct }>(`/products/${id}`, { cached: productsCache })
    .then(({ product }) => product)
    .catch(() => null)
}

export async function listArtisanCategories() {
  return artisanFetch<{ categories: { id: string; name: string }[] }>("/categories", {
    cached: { next: { revalidate: 3600 } },
  })
    .then(({ categories }) => categories)
    .catch(() => [])
}

/** `custom`: only custom-made sub-orders (true) or only the others (false). */
export async function listArtisanSubOrders(status?: string, custom?: boolean) {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  if (custom !== undefined) params.set("custom", String(custom))
  const query = params.toString()

  return artisanFetch<{ sub_orders: ArtisanSubOrder[] }>(
    `/sub-orders${query ? `?${query}` : ""}`
  )
    .then(({ sub_orders }) => sub_orders)
    .catch(() => [] as ArtisanSubOrder[])
}

export async function getArtisanSubOrder(id: string) {
  return artisanFetch<{ sub_order: ArtisanSubOrder }>(`/sub-orders/${id}`)
    .then(({ sub_order }) => sub_order)
    .catch(() => null)
}

export async function listArtisanCustomRequests() {
  return artisanFetch<{ custom_requests: CustomRequest[] }>("/custom-requests")
    .then(({ custom_requests }) => custom_requests)
    .catch(() => [] as CustomRequest[])
}

export async function listArtisanPayouts() {
  return artisanFetch<{ payouts: Payout[] }>("/payouts")
    .then(({ payouts }) => payouts)
    .catch(() => [] as Payout[])
}

// ---- Mutations --------------------------------------------------------------

type Result = { error: string | null }

const run = async (action: () => Promise<unknown>): Promise<Result> => {
  try {
    await action()
    return { error: null }
  } catch (error) {
    return { error: toError(error) }
  }
}

export type ProductPayload = {
  title: string
  description?: string
  fulfillment_type: "ready" | "made_to_order"
  lead_days?: number | null
  images?: string[]
  category_ids?: string[]
  status?: "published" | "draft"
  price?: number
  stock?: number | null
  variants?: { id: string; price: number; stock?: number | null }[]
}

export async function saveArtisanProduct(
  id: string | null,
  payload: ProductPayload
): Promise<Result & { id?: string }> {
  try {
    const { product } = await artisanFetch<{ product: ArtisanProduct }>(
      id ? `/products/${id}` : "/products",
      { method: "POST", body: payload }
    )
    revalidateTag(PRODUCTS_TAG)
    return { error: null, id: product.id }
  } catch (error) {
    return { error: toError(error) }
  }
}

export async function deleteArtisanProduct(id: string) {
  const result = await run(() => artisanFetch(`/products/${id}`, { method: "DELETE" }))
  revalidateTag(PRODUCTS_TAG)
  return result
}

/** Product photos go through here so the browser never holds the token. */
export async function uploadArtisanImages(
  formData: FormData
): Promise<Result & { urls: string[] }> {
  try {
    const files = formData.getAll("files").filter((file): file is File => file instanceof File)
    const payload = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        mime_type: file.type,
        content_base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      }))
    )
    const { files: uploaded } = await artisanFetch<{ files: { url: string }[] }>(
      "/uploads",
      { method: "POST", body: { files: payload } }
    )
    return { error: null, urls: uploaded.map((file) => file.url) }
  } catch (error) {
    return { error: toError(error), urls: [] }
  }
}

export async function requestArtisanImageUpload(input: { filename: string; mime_type: string; size: number }) {
  try {
    const result = await artisanFetch<{ id: string; upload_url: string; headers: Record<string, string> }>("/uploads/sign", { method: "POST", body: input })
    return { error: null, upload: result }
  } catch (error) { return { error: toError(error), upload: null } }
}

export async function completeArtisanImageUpload(id: string) {
  try {
    const { file } = await artisanFetch<{ file: { id: string; url: string } }>(`/uploads/${encodeURIComponent(id)}/complete`, { method: "POST" })
    return { error: null, url: file.url }
  } catch (error) { return { error: toError(error), url: null } }
}

export async function acceptSubOrder(id: string) {
  return run(() => artisanFetch(`/sub-orders/${id}/accept`, { method: "POST" }))
}

export async function declineSubOrder(id: string, reason: string) {
  return run(() =>
    artisanFetch(`/sub-orders/${id}/decline`, { method: "POST", body: { reason } })
  )
}

export async function markSubOrderReady(id: string) {
  return run(() => artisanFetch(`/sub-orders/${id}/ready`, { method: "POST" }))
}

export async function respondCustomRequest(
  id: string,
  body: { accept: boolean; price?: number; lead_days?: number; note?: string }
) {
  return run(() =>
    artisanFetch(`/custom-requests/${id}/respond`, { method: "POST", body })
  )
}
