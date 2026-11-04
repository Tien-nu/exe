"use client"

import { updateArtisanProfile } from "@lib/data/artisan-portal"
import type { Artisan } from "@lib/marketplace-types"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button, Field, Notice, fieldClass } from "../ui"
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
    <form action={action} className="flex flex-col gap-5">
      <Field label="Sign-in email">
        <input value={artisan.email} disabled className={fieldClass} />
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
      {!artisan.pickup_province_name && (
        <Notice tone="warning">
          Customers cannot check out your products until you choose a pickup province/city.
          Shipping is VND 18,000 per parcel within the province and VND 22,000 outside it.
        </Notice>
      )}
      <Field label="Shop introduction">
        <textarea
          name="description"
          rows={3}
          defaultValue={state?.values?.description ?? artisan.description ?? ""}
          className={fieldClass}
        />
      </Field>
      {state?.error && <p className="txt-small text-[#8f4333]">{state.error}</p>}
      {state?.success && <p role="status" className="txt-small text-yarnly-moss">Changes saved.</p>}
      <div className="border-t border-yarnly-line pt-5">
        <Save />
      </div>
    </form>
  )
}
