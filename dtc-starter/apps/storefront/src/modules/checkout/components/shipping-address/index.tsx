import WardSelect from "@modules/common/components/ward-select"
import { VIETNAM_PROVINCES, provinceCode } from "@lib/vietnam-provinces"
import { HttpTypes } from "@medusajs/types"
import { Container } from "@modules/common/components/ui"
import Checkbox from "@modules/common/components/checkbox"
import Input from "@modules/common/components/input"
import { mapKeys } from "lodash"
import React, { useEffect, useMemo, useState } from "react"
import AddressSelect from "../address-select"

const ShippingAddress = ({
  customer,
  cart,
  checked,
  onChange,
}: {
  customer: HttpTypes.StoreCustomer | null
  cart: HttpTypes.StoreCart | null
  checked: boolean
  onChange: () => void
}) => {
  const [formData, setFormData] = useState<Record<string, string>>({
    "shipping_address.first_name": cart?.shipping_address?.first_name || "",
    "shipping_address.last_name": cart?.shipping_address?.last_name || "",
    "shipping_address.address_1": cart?.shipping_address?.address_1 || "",
    "shipping_address.company": cart?.shipping_address?.company || "",
    "shipping_address.city": cart?.shipping_address?.city || "",
    "shipping_address.country_code":
      cart?.shipping_address?.country_code || "vn",
    "shipping_address.province": cart?.shipping_address?.province || "",
    "shipping_address.phone": cart?.shipping_address?.phone || "",
    email: cart?.email || "",
  })

  const addressParts = (cart?.shipping_address?.address_1 || "").split(", ")
  const initialWard = addressParts.length >= 2 ? addressParts.pop() || "" : ""
  const initialStreet = addressParts.join(", ")

  const [selectedProvinceName, setSelectedProvinceName] = useState<string>(
    cart?.shipping_address?.province || ""
  )
  const [selectedDistrictName, setSelectedDistrictName] = useState<string>(
    cart?.shipping_address?.city || ""
  )
  const [selectedWardName, setSelectedWardName] = useState<string>(initialWard)
  const [streetAddress, setStreetAddress] = useState<string>(initialStreet)
  const [isInitialized, setIsInitialized] = useState(false)

  // Sync back to formData
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true)
      return
    }
    const fullAddress = [streetAddress, selectedWardName]
      .filter(Boolean)
      .join(", ")
    setFormData((prev) => ({
      ...prev,
      "shipping_address.province": selectedProvinceName,
      "shipping_address.city": selectedDistrictName,
      "shipping_address.address_1": fullAddress,
    }))
  }, [
    selectedProvinceName,
    selectedDistrictName,
    selectedWardName,
    streetAddress,
    isInitialized,
  ])

  const countriesInRegion = useMemo(
    () => cart?.region?.countries?.map((c) => c.iso_2),
    [cart?.region]
  )

  const addressesInRegion = useMemo(
    () =>
      customer?.addresses.filter(
        (a) => a.country_code && countriesInRegion?.includes(a.country_code)
      ),
    [customer?.addresses, countriesInRegion]
  )

  const setFormAddress = (
    address?: HttpTypes.StoreCartAddress,
    email?: string
  ) => {
    if (address) {
      setFormData((prevState: Record<string, string>) => ({
        ...prevState,
        "shipping_address.first_name": address?.first_name || "",
        "shipping_address.last_name": address?.last_name || "",
        "shipping_address.address_1": address?.address_1 || "",
        "shipping_address.company": address?.company || "",
        "shipping_address.city": address?.city || "",
        "shipping_address.country_code": address?.country_code || "vn",
        "shipping_address.province": address?.province || "",
        "shipping_address.phone": address?.phone || "",
      }))

      setSelectedProvinceName(address.province || "")
      setSelectedDistrictName(address.city || "")
      const parts = (address.address_1 || "").split(", ")
      if (parts.length >= 2) {
        setSelectedWardName(parts.pop() || "")
        setStreetAddress(parts.join(", "))
      } else {
        setStreetAddress(address.address_1 || "")
        setSelectedWardName("")
      }
    }

    if (email) {
      setFormData((prevState: Record<string, string>) => ({
        ...prevState,
        email: email,
      }))
    }
  }

  useEffect(() => {
    if (cart && cart.shipping_address) {
      setFormAddress(cart?.shipping_address, cart?.email)
    }

    if (cart && !cart.email && customer?.email) {
      setFormAddress(undefined, customer.email)
    }
  }, [cart])

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
      {customer && (addressesInRegion?.length || 0) > 0 && (
        <Container className="mb-6 flex flex-col gap-y-4 p-5">
          <p className="text-small-regular">
            {`Hi ${customer.first_name}, do you want to use one of your saved addresses?`}
          </p>
          <AddressSelect
            addresses={customer.addresses}
            addressInput={
              mapKeys(formData, (_, key) =>
                key.replace("shipping_address.", "")
              ) as unknown as HttpTypes.StoreCartAddress
            }
            onSelect={setFormAddress}
          />
        </Container>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          name="shipping_address.first_name"
          autoComplete="given-name"
          value={formData["shipping_address.first_name"]}
          onChange={handleChange}
          required
          data-testid="shipping-first-name-input"
        />
        <Input
          label="Last name"
          name="shipping_address.last_name"
          autoComplete="family-name"
          value={formData["shipping_address.last_name"]}
          onChange={handleChange}
          required
          data-testid="shipping-last-name-input"
        />
        <Input
          label="Phone number"
          name="shipping_address.phone"
          autoComplete="tel"
          value={formData["shipping_address.phone"]}
          onChange={handleChange}
          data-testid="shipping-phone-input"
          required
        />
        <Input
          label="Company (optional)"
          name="shipping_address.company"
          value={formData["shipping_address.company"]}
          onChange={handleChange}
          autoComplete="organization"
          data-testid="shipping-company-input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 mt-4">
        <label className="block text-sm">
          Province / City
          <select
            aria-label="Province / City"
            className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-4 py-2 focus:ring-1 focus:ring-gray-900"
            value={provinceCode(selectedProvinceName) ?? ""}
            onChange={(event) => {
              setSelectedProvinceName(
                VIETNAM_PROVINCES.find(
                  (province) => province.code === event.target.value
                )?.name ?? ""
              )
              setSelectedWardName("")
              setSelectedDistrictName("")
            }}
            required
          >
            <option value="">Select a province / city</option>
            {VIETNAM_PROVINCES.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <WardSelect
            labelPlacement="inside"
            province={selectedProvinceName}
            name="ward_name"
            value={selectedWardName}
            onChange={(name) => setSelectedWardName(name)}
          />
          <Input
            label="District (if applicable)"
            name="district_name"
            value={selectedDistrictName}
            onChange={(event) => setSelectedDistrictName(event.target.value)}
          />
        </div>

        <Input
          label="House number and street (e.g. 123 Le Loi)"
          name="street_address"
          value={streetAddress}
          onChange={(e) => setStreetAddress(e.target.value)}
          required
        />
      </div>

      <input type="hidden" name="shipping_address.country_code" value="vn" />
      <input
        type="hidden"
        name="shipping_address.province"
        value={formData["shipping_address.province"]}
      />
      <input
        type="hidden"
        name="shipping_address.city"
        value={formData["shipping_address.city"]}
      />
      <input
        type="hidden"
        name="shipping_address.address_1"
        value={formData["shipping_address.address_1"]}
      />

      <div className="my-8">
        <Checkbox
          label="Billing address same as shipping address"
          name="same_as_billing"
          checked={checked}
          onChange={onChange}
          data-testid="billing-address-checkbox"
        />
      </div>
      <div className="mb-4">
        <Input
          label="Contact email"
          name="email"
          type="email"
          title="Enter a valid email address."
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          required
          data-testid="shipping-email-input"
        />
      </div>
    </>
  )
}

export default ShippingAddress
