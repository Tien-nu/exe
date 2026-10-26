import { provinceCode, provinceName } from "../lib/vietnam-provinces"
import { ApiError } from "./http"

export const REGIONAL_SHIPPING = { version: "regional-v1-18000-22000", same_province: 18000, other_province: 22000 } as const
export function regionalFee(origin: unknown, destination: unknown) {
  const from = provinceCode(origin), to = provinceCode(destination)
  if (!to) throw new ApiError(400, "Please select a valid delivery province or city")
  if (!from) throw new ApiError(409, "This shop has not provided a pickup province or city. Please contact the shop to update it")
  const sameProvince = from === to
  return { fee: sameProvince ? REGIONAL_SHIPPING.same_province : REGIONAL_SHIPPING.other_province,
    region: sameProvince ? "same_province" : "other_province", origin_province: provinceName(origin), destination_province: provinceName(destination) }
}
