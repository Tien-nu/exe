"use client"

import { updateArtisanProfile } from "@lib/data/artisan-portal"
import type { Artisan } from "@lib/marketplace-types"
import { Button } from "@modules/common/components/ui"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Field, fieldClass } from "../ui"
import PickupAddressFields from "./pickup-address-fields"

const FIELDS: { name: keyof Artisan; label: string; hint?: string }[] = [
  { name: "shop_name", label: "Shop name" },
  { name: "full_name", label: "Full name" },
  { name: "phone", label: "Phone number" },
  { name: "pickup_address", label: "Pickup street address", hint: "Your shop's dispatch address" },
  { name: "bank_name", label: "Receiving bank" },
  { name: "bank_account_number", label: "Account number" },
  { name: "bank_account_name", label: "Account holder" },
]

const Save = () => {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" isLoading={pending}>
      Save
    </Button>
  )
}

export default function ProfileForm({ artisan }: { artisan: Artisan }) {
  const [state, action] = useActionState(updateArtisanProfile, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Sign-in email">
        <input value={artisan.email} disabled className={`${fieldClass} bg-gray-50`} />
      </Field>
      <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
        {FIELDS.map((field) => (
          <Field key={field.name} label={field.label} hint={field.hint}>
            <input
              name={field.name}
              required
              defaultValue={state?.values?.[field.name] ?? String(artisan[field.name] ?? "")}
              className={fieldClass}
            />
          </Field>
        ))}
      </div>
      <PickupAddressFields value={state?.values ?? artisan} />
      {!artisan.pickup_ward_code && (
        <p className="txt-small text-amber-700">
          Choose your pickup province/city to calculate shipping at VND 18,000 within the province or VND 22,000 outside it per parcel.
        </p>
      )}
      <Field label="Shop introduction">
        <textarea
          name="description"
          rows={3}
          defaultValue={state?.values?.description ?? artisan.description ?? ""}
          className={fieldClass}
        />
      </Field>
      {state?.error && <p className="txt-small text-red-600">{state.error}</p>}
      {state?.success && <p className="txt-small text-emerald-700">Saved.</p>}
      <div>
        <Save />
      </div>
    </form>
  )
}
