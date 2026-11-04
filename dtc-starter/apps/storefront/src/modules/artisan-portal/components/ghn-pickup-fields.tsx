"use client"

import { useEffect, useState } from "react"
import { Field, fieldClass } from "../ui"

type Option = { id: string; name: string }

export type PickupValue = {
  pickup_province_name?: string | null
  pickup_district_id?: number | string | null
  pickup_district_name?: string | null
  pickup_ward_code?: string | null
  pickup_ward_name?: string | null
}

const BACKEND = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

async function load(path: string, map: (row: any) => Option): Promise<Option[]> {
  const response = await fetch(`${BACKEND}/store/ghn/${path}`, {
    headers: { "x-publishable-api-key": KEY },
  })
  const result = await response.json().catch(() => ({}))
  return (result.data ?? []).map(map)
}

/**
 * Province / district / ward of the pickup address, from GHN's own lists so
 * GHN can book a shipper there. Submits the pickup_* fields as hidden inputs.
 */
export default function GhnPickupFields({ value }: { value?: PickupValue }) {
  const [provinces, setProvinces] = useState<Option[]>([])
  const [districts, setDistricts] = useState<Option[]>([])
  const [wards, setWards] = useState<Option[]>([])
  const [province, setProvince] = useState<Option | null>(null)
  const [district, setDistrict] = useState<Option | null>(
    value?.pickup_district_id
      ? { id: String(value.pickup_district_id), name: value.pickup_district_name ?? "" }
      : null
  )
  const [ward, setWard] = useState<Option | null>(
    value?.pickup_ward_code ? { id: value.pickup_ward_code, name: value.pickup_ward_name ?? "" } : null
  )
  const [error, setError] = useState<string | null>(null)

  // Each list follows the *id* of its parent and ignores answers that arrive
  // after the parent changed again (or after React's dev double-run).
  useEffect(() => {
    let active = true
    load("provinces", (p) => ({ id: String(p.ProvinceID), name: p.ProvinceName }))
      .then((list) => {
        if (!active) return
        setProvinces(list)
        const saved = list.find((p) => p.name === value?.pickup_province_name)
        if (saved) setProvince(saved)
      })
      .catch(() => active && setError("Không tải được danh sách tỉnh từ GHN"))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const provinceId = province?.id
  useEffect(() => {
    let active = true
    setDistricts([])
    if (provinceId) {
      load(`districts?province_id=${provinceId}`, (d) => ({ id: String(d.DistrictID), name: d.DistrictName }))
        .then((list) => active && setDistricts(list))
        .catch(() => active && setError("Không tải được danh sách quận/huyện"))
    }
    return () => {
      active = false
    }
  }, [provinceId])

  const districtId = district?.id
  useEffect(() => {
    let active = true
    setWards([])
    if (districtId) {
      load(`wards?district_id=${districtId}`, (w) => ({ id: String(w.WardCode), name: w.WardName }))
        .then((list) => active && setWards(list))
        .catch(() => active && setError("Không tải được danh sách phường/xã"))
    }
    return () => {
      active = false
    }
  }, [districtId])

  const pick = (list: Option[], id: string) => list.find((option) => option.id === id) ?? null
  // While a list is still loading, the saved choice stays a valid option.
  const withSelected = (list: Option[], selected: Option | null) =>
    selected && !list.some((option) => option.id === selected.id) ? [selected, ...list] : list

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 small:grid-cols-3">
        <Field label="Tỉnh / Thành phố lấy hàng">
          <select
            required
            className={fieldClass}
            value={province?.id ?? ""}
            onChange={(event) => {
              setProvince(pick(provinces, event.target.value))
              setDistrict(null)
              setWard(null)
            }}
          >
            <option value="">Chọn tỉnh / thành</option>
            {provinces.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quận / Huyện">
          <select
            required
            disabled={!province}
            className={fieldClass}
            value={district?.id ?? ""}
            onChange={(event) => {
              setDistrict(pick(districts, event.target.value))
              setWard(null)
            }}
          >
            <option value="">Chọn quận / huyện</option>
            {withSelected(districts, district).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phường / Xã">
          <select
            required
            disabled={!district}
            className={fieldClass}
            value={ward?.id ?? ""}
            onChange={(event) => setWard(pick(wards, event.target.value))}
          >
            <option value="">Chọn phường / xã</option>
            {withSelected(wards, ward).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p className="txt-small text-[#8f4333]">{error}</p>}
      <input type="hidden" name="pickup_province_name" value={province?.name ?? ""} />
      <input type="hidden" name="pickup_district_id" value={district?.id ?? ""} />
      <input type="hidden" name="pickup_district_name" value={district?.name ?? ""} />
      <input type="hidden" name="pickup_ward_code" value={ward?.id ?? ""} />
      <input type="hidden" name="pickup_ward_name" value={ward?.name ?? ""} />
    </div>
  )
}
