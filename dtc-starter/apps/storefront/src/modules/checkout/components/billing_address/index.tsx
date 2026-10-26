import WardSelect from "@modules/common/components/ward-select"
import { VIETNAM_PROVINCES, provinceName } from "@lib/vietnam-provinces"
import { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import React, { useEffect, useState } from "react"

const BillingAddress = ({ cart }: { cart: HttpTypes.StoreCart | null }) => {
  const [formData, setFormData] = useState<Record<string, string>>({
    "billing_address.first_name": cart?.billing_address?.first_name || "",
    "billing_address.last_name": cart?.billing_address?.last_name || "",
    "billing_address.address_1": cart?.billing_address?.address_1 || "",
    "billing_address.company": cart?.billing_address?.company || "",
    "billing_address.city": cart?.billing_address?.city || "",
    "billing_address.country_code": cart?.billing_address?.country_code || "vn",
    "billing_address.province": cart?.billing_address?.province || "",
    "billing_address.phone": cart?.billing_address?.phone || "",
  })

  const addressParts = (cart?.billing_address?.address_1 || "").split(", ")
  const initialWard = addressParts.length >= 2 ? addressParts.pop() || "" : ""
  const initialStreet = addressParts.join(", ")

  const [selectedProvince, setSelectedProvince] = useState<string>(
    cart?.billing_address?.province || ""
  )
  const [selectedDistrict, setSelectedDistrict] = useState<string>(
    cart?.billing_address?.city || ""
  )
  const [selectedWard, setSelectedWard] = useState<string>(initialWard)
  const [streetAddress, setStreetAddress] = useState<string>(initialStreet)

  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true)
      return
    }
    const fullAddress = [streetAddress, selectedWard].filter(Boolean).join(", ")
    setFormData((prev) => ({
      ...prev,
      "billing_address.province": selectedProvince,
      "billing_address.city": selectedDistrict,
      "billing_address.address_1": fullAddress,
    }))
  }, [
    selectedProvince,
    selectedDistrict,
    selectedWard,
    streetAddress,
    isInitialized,
  ])

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLInputElement | HTMLSelectElement
    >
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          name="billing_address.first_name"
          autoComplete="given-name"
          value={formData["billing_address.first_name"]}
          onChange={handleChange}
          required
          data-testid="billing-first-name-input"
        />
        <Input
          label="Last name"
          name="billing_address.last_name"
          autoComplete="family-name"
          value={formData["billing_address.last_name"]}
          onChange={handleChange}
          required
          data-testid="billing-last-name-input"
        />
        <Input
          label="Phone number"
          name="billing_address.phone"
          autoComplete="tel"
          value={formData["billing_address.phone"]}
          onChange={handleChange}
          data-testid="billing-phone-input"
          required
        />
        <Input
          label="Company (optional)"
          name="billing_address.company"
          value={formData["billing_address.company"]}
          onChange={handleChange}
          autoComplete="organization"
          data-testid="billing-company-input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 mt-4">
        <label className="block text-sm">
          Province / City
          <select
            aria-label="Billing province / city"
            className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-4 py-2"
            value={provinceName(selectedProvince) ?? ""}
            onChange={(event) => {
              setSelectedProvince(event.target.value)
              setSelectedWard("")
              setSelectedDistrict("")
            }}
            required
          >
            <option value="">Select a province / city</option>
            {VIETNAM_PROVINCES.map((province) => (
              <option key={province.code} value={province.name}>
                {province.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <WardSelect
            labelPlacement="inside"
            label="Billing ward / commune"
            province={selectedProvince}
            value={selectedWard}
            name="billing_ward_name"
            onChange={(name) => setSelectedWard(name)}
          />
          <Input
            label="District (if applicable)"
            name="billing_district_name"
            value={selectedDistrict}
            onChange={(event) => setSelectedDistrict(event.target.value)}
          />
        </div>

        <Input
          label="House number and street (e.g. 123 Le Loi)"
          name="billing_street_address"
          value={streetAddress}
          onChange={(e) => setStreetAddress(e.target.value)}
          required
        />
      </div>

      <input type="hidden" name="billing_address.country_code" value="vn" />
      <input
        type="hidden"
        name="billing_address.province"
        value={formData["billing_address.province"]}
      />
      <input
        type="hidden"
        name="billing_address.city"
        value={formData["billing_address.city"]}
      />
      <input
        type="hidden"
        name="billing_address.address_1"
        value={formData["billing_address.address_1"]}
      />
    </>
  )
}

export default BillingAddress
