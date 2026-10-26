// Current provincial names and historical aliases, NQ 202/2025/QH15:
// https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-202-2025-qh15-ve-sap-xep-don-vi-hanh-chinh-cap-tinh-119250612174148722.htm
const groups = [
  ["Hà Nội"], ["Huế", "Thừa Thiên Huế"], ["Lai Châu"], ["Điện Biên"], ["Sơn La"],
  ["Lạng Sơn"], ["Quảng Ninh"], ["Thanh Hóa", "Thanh Hoá"], ["Nghệ An"], ["Hà Tĩnh"], ["Cao Bằng"],
  ["Tuyên Quang", "Hà Giang"], ["Lào Cai", "Yên Bái"], ["Thái Nguyên", "Bắc Kạn", "Bắc Cạn"],
  ["Phú Thọ", "Vĩnh Phúc", "Hòa Bình", "Hoà Bình"], ["Bắc Ninh", "Bắc Giang"], ["Hưng Yên", "Thái Bình"],
  ["Hải Phòng", "Hải Dương"], ["Ninh Bình", "Hà Nam", "Nam Định"], ["Quảng Trị", "Quảng Bình"],
  ["Đà Nẵng", "Quảng Nam"], ["Quảng Ngãi", "Kon Tum"], ["Gia Lai", "Bình Định"],
  ["Khánh Hòa", "Khánh Hoà", "Ninh Thuận"], ["Lâm Đồng", "Bình Thuận", "Đắk Nông", "Đăk Nông"],
  ["Đắk Lắk", "Đăk Lăk", "Đắk Lắc", "Phú Yên"], ["Hồ Chí Minh", "HCM", "TPHCM", "Sài Gòn", "Bình Dương", "Bà Rịa Vũng Tàu"],
  ["Đồng Nai", "Bình Phước"], ["Tây Ninh", "Long An"], ["Cần Thơ", "Hậu Giang", "Sóc Trăng"],
  ["Vĩnh Long", "Bến Tre", "Trà Vinh"], ["Đồng Tháp", "Tiền Giang"], ["Cà Mau", "Bạc Liêu"], ["An Giang", "Kiên Giang"],
]
const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
  .replace(/^(tinh|thanh pho|tp)[.\s]+/, "").replace(/[^a-z0-9]/g, "")
export const VIETNAM_PROVINCES = groups.map(([name]) => ({ code: normalize(name), name })).sort((a, b) => a.name.localeCompare(b.name, "vi"))
const aliases = new Map(groups.flatMap(([name, ...old]) => [name, ...old].map((alias) => [normalize(alias), normalize(name)])))
export function provinceCode(value: unknown): string | undefined {
  return typeof value === "string" ? aliases.get(normalize(value.trim())) : undefined
}
export function provinceName(value: unknown): string | undefined {
  const code = provinceCode(value)
  return VIETNAM_PROVINCES.find((province) => province.code === code)?.name
}
