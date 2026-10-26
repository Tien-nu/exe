import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"

import { backendUrl } from "./lib/backend-url"

const BACKEND_URL = backendUrl()
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "vn"

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap(cacheId: string) {
  // This migration serves the Vietnam/VND market. Do not call a protected
  // Vercel deployment over HTTP from its own Edge middleware.
  if (process.env.NEXT_PUBLIC_YARNLY_BACKEND_MODE === "mongodb") return new Map<string, number>([[DEFAULT_REGION, 1]])
  const { regionMap, regionMapUpdated } = regionMapCache

  if (!BACKEND_URL) {
    throw new Error(
      "Middleware.ts: Error fetching regions. Did you set up regions in your Medusa Admin and define a NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable."
    )
  }

  if (
    !regionMap.keys().next().value ||
    regionMapUpdated < Date.now() - 60 * 1000
  ) {
    // Fetch regions from Medusa. We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
    const response = await fetch(`${BACKEND_URL}/store/regions`, {
      method: "GET",
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
      },
      next: {
        revalidate: 60,
        tags: [`regions-${cacheId}`],
      },
      cache: "force-cache",
    })

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`)
    }

    const json = await response.json()

    const { regions } = json

    if (!regions?.length) {
      return new Map<string, HttpTypes.StoreRegion>()
    }

    // Create a map of country codes to regions.
    regions.forEach((region: HttpTypes.StoreRegion) => {
      region.countries?.forEach((c) => {
        regionMapCache.regionMap.set(c.iso_2 ?? "", region)
      })
    })

    regionMapCache.regionMapUpdated = Date.now()
  }

  return regionMapCache.regionMap
}

/**
 * Fetches regions from Medusa and sets the region cookie.
 * @param request
 * @param response
 */
async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  let countryCode

  const urlCountryCode = request.nextUrl.pathname.split("/")[1]?.toLowerCase()

  // Cloudflare Workers provides country via request.cf.country
  const cloudflareCountryCode = (request as { cf?: { country?: string } }).cf?.country?.toLowerCase()

  // Vercel provides x-vercel-ip-country header
  const vercelCountryCode = request.headers
    .get("x-vercel-ip-country")
    ?.toLowerCase()

  if (urlCountryCode && regionMap.has(urlCountryCode)) {
    countryCode = urlCountryCode
  } else if (cloudflareCountryCode && regionMap.has(cloudflareCountryCode)) {
    countryCode = cloudflareCountryCode
  } else if (vercelCountryCode && regionMap.has(vercelCountryCode)) {
    countryCode = vercelCountryCode
  } else if (regionMap.has(DEFAULT_REGION)) {
    countryCode = DEFAULT_REGION
  } else if (regionMap.keys().next().value) {
    countryCode = regionMap.keys().next().value
  }

  return countryCode
}

// Login tokens of customers and artisans. A token that expired (or cannot be
// read) is dropped here, so pages treat the visitor as signed out and show
// the login form instead of failing with "Unauthorized".
const AUTH_COOKIES = ["_medusa_jwt", "_yarnly_artisan_jwt"]

function isExpiredToken(token: string) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4)
    const { exp } = JSON.parse(atob(padded)) as { exp?: number }
    // A small margin so a token does not expire in the middle of a request.
    return typeof exp === "number" && exp * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

function dropExpiredLogins(request: NextRequest) {
  const expired = AUTH_COOKIES.filter((name) => {
    const value = request.cookies.get(name)?.value
    return value !== undefined && isExpiredToken(value)
  })

  // Hide them from this request's server rendering too, not only the browser:
  // pages read the Cookie header forwarded here.
  const headers = new Headers(request.headers)

  if (expired.length) {
    const kept = request.cookies
      .getAll()
      .filter((cookie) => !expired.includes(cookie.name))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ")
    headers.set("cookie", kept)
  }

  const finish = <T extends NextResponse>(response: T) => {
    expired.forEach((name) => response.cookies.delete(name))
    return response
  }

  return { headers, finish }
}

/**
 * Middleware to handle region selection and onboarding status.
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/") || request.nextUrl.pathname === "/auth" || request.nextUrl.pathname.startsWith("/auth/") || request.nextUrl.pathname === "/app" || request.nextUrl.pathname.startsWith("/app/") || request.nextUrl.pathname.includes(".")) {
    return NextResponse.next()
  }

  const logins = dropExpiredLogins(request)
  const next = () => logins.finish(NextResponse.next({ request: { headers: logins.headers } }))

  const cacheIdCookie = request.cookies.get("_medusa_cache_id")
  const cacheId = cacheIdCookie?.value || crypto.randomUUID()

  // The backend may be waking up (free hosting sleeps when idle). Fall back to
  // the default region instead of failing every page with a 500.
  const regionMap = await getRegionMap(cacheId).catch((error) => {
    console.error(error)
    return new Map<string, HttpTypes.StoreRegion>()
  })
  const countryCode = await getCountryCode(request, regionMap)

  // if the country code is available, use it, otherwise use the default region
  const country = countryCode || DEFAULT_REGION
  const firstPathSegment = request.nextUrl.pathname.split("/")[1]?.toLowerCase()
  const urlHasCountry = firstPathSegment === country.toLowerCase()

  if (urlHasCountry) {
    if (!cacheIdCookie) {
      const response = next()
      response.cookies.set("_medusa_cache_id", cacheId, {
        maxAge: 60 * 60 * 24,
      })
      return response
    }
    return next()
  }

  // if the url doesn't have the country, redirect to it
  const redirectPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname
  const queryString = request.nextUrl.search || ""
  const redirectUrl = `${request.nextUrl.origin}/${country}${redirectPath}${queryString}`

  return logins.finish(NextResponse.redirect(redirectUrl, 307))
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
}
