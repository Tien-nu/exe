import { wardsForProvince } from "../../../../server/vietnam-wards"
import { ApiError, errorResponse } from "../../../../server/http"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const province = new URL(request.url).searchParams.get("province")
    const wards = wardsForProvince(province)
    if (!wards) throw new ApiError(400, "Please select a valid province / city")
    return Response.json(
      { wards },
      {
        headers: {
          "Cache-Control":
            "public, max-age=86400, stale-while-revalidate=86400",
        },
      }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
