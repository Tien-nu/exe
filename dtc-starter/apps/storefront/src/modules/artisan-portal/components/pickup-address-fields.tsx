"use client"

import { useState } from "react"
import WardSelect from "@modules/common/components/ward-select"
import {
  VIETNAM_PROVINCES,
  provinceCode,
  provinceName,
} from "@lib/vietnam-provinces"
import { Field, fieldClass } from "../ui"

export type PickupValue = {
  pickup_province_name?: string | null
  pickup_district_id?: number | string | null
  pickup_district_name?: string | null
  pickup_ward_code?: string | null
  pickup_ward_name?: string | null
}

export default function PickupFields({ value }: { value?: PickupValue }) {
  const [province, setProvince] = useState(
    provinceCode(value?.pickup_province_name) ?? ""
  )
  const [ward, setWard] = useState(value?.pickup_ward_name ?? "")
  const [wardCode, setWardCode] = useState(value?.pickup_ward_code ?? "")
  const [district, setDistrict] = useState(value?.pickup_district_name ?? "")
  return (
    <div className="grid grid-cols-1 gap-4 xsmall:grid-cols-2">
      <Field label="Pickup province / city">
        <select
          aria-label="Pickup province / city"
          className={fieldClass}
          value={province}
          onChange={(event) => {
            setProvince(event.target.value)
            setWard("")
            setWardCode("")
            setDistrict("")
          }}
          required
        >
          <option value="">Select a province / city</option>
          {VIETNAM_PROVINCES.map((row) => (
            <option key={row.code} value={row.code}>
              {row.name}
            </option>
          ))}
        </select>
      </Field>
      <WardSelect
        label="Pickup ward / commune"
        province={province}
        name="pickup_ward_name"
        value={ward}
        onChange={(name, code) => {
          setWard(name)
          setWardCode(code)
        }}
        labelClassName="mb-1.5 block txt-small-plus text-yarnly-ink"
        selectClassName={fieldClass}
      />
      <input type="hidden" name="pickup_ward_code" value={wardCode} />
      <Field label="District (if applicable)" className="xsmall:col-span-2">
        <input
          className={fieldClass}
          name="pickup_district_name"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
        />
      </Field>
      <input
        type="hidden"
        name="pickup_province_name"
        value={provinceName(province) ?? ""}
      />
    </div>
  )
}
