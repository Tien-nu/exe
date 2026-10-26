import { VIETNAM_PROVINCES } from "../lib/vietnam-provinces"

export async function ghnAddresses(request: Request, path: string[]) {
  if (!["addresses", "ghn"].includes(path[0]) || path.length !== 2 || request.method !== "GET") return undefined
  if (path[1] === "provinces") return { data: VIETNAM_PROVINCES.map((province) => ({ ProvinceID: province.code, ProvinceName: province.name })) }
  if (["districts", "wards"].includes(path[1])) return { data: [] }
  return undefined
}
