"use client"

import { artisanLogin, artisanRegister } from "@lib/data/artisan-portal"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@modules/common/components/ui"
import { useParams } from "next/navigation"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Field, fieldClass } from "../ui"
import PickupAddressFields from "./pickup-address-fields"

const Submit = ({ children }: { children: React.ReactNode }) => {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" isLoading={pending}>
      {children}
    </Button>
  )
}

export const ArtisanLoginForm = () => {
  const { countryCode } = useParams() as { countryCode: string }
  const [state, action] = useActionState(artisanLogin, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="country_code" value={countryCode} />
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state?.values?.email ?? ""}
          className={fieldClass}
        />
      </Field>
      <Field label="Password">
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={fieldClass}
        />
      </Field>
      {state?.error && <p className="txt-small text-red-600">{state.error}</p>}
      <Submit>Sign in</Submit>
      <p className="txt-small text-center text-ui-fg-subtle">
        Don't have a shop yet?{" "}
        <LocalizedClientLink href="/kenh-nghe-nhan/dang-ky" className="text-violet-700 underline">
          Become an artisan
        </LocalizedClientLink>
      </p>
    </form>
  )
}

const REGISTER_FIELDS: {
  name: string
  label: string
  type?: string
  hint?: string
  required?: boolean
}[] = [
  { name: "shop_name", label: "Shop name", required: true },
  { name: "full_name", label: "Full name", required: true },
  { name: "email", label: "Email (used to sign in)", type: "email", required: true },
  { name: "password", label: "Password", type: "password", hint: "At least 8 characters", required: true },
  { name: "phone", label: "Phone number", required: true },
  {
    name: "pickup_address",
    label: "Pickup street address",
    hint: "Your shop's dispatch address",
    required: true,
  },
  { name: "bank_name", label: "Receiving bank", required: true },
  { name: "bank_account_number", label: "Account number", required: true },
  { name: "bank_account_name", label: "Account holder", required: true },
]

export const ArtisanRegisterForm = () => {
  const { countryCode } = useParams() as { countryCode: string }
  const [state, action] = useActionState(artisanRegister, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="country_code" value={countryCode} />
      <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
        {REGISTER_FIELDS.map((field) => (
          <Field key={field.name} label={field.label} hint={field.hint}>
            <input
              name={field.name}
              type={field.type ?? "text"}
              required={field.required}
              defaultValue={field.type === "password" ? undefined : state?.values?.[field.name] ?? ""}
              className={fieldClass}
            />
          </Field>
        ))}
      </div>
      <PickupAddressFields value={state?.values} />
      <Field label="Shop introduction (optional)">
        <textarea
          name="description"
          rows={3}
          defaultValue={state?.values?.description ?? ""}
          className={fieldClass}
        />
      </Field>
      <p className="txt-small text-ui-fg-subtle">
        Yarnly collects payments from customers and pays you every Monday. The current platform fee is 0%. Your account must be approved by an admin before you can sell.
      </p>
      {state?.error && <p className="txt-small text-red-600">{state.error}</p>}
      <Submit>Register</Submit>
      <p className="txt-small text-center text-ui-fg-subtle">
        Already have a shop?{" "}
        <LocalizedClientLink href="/kenh-nghe-nhan/dang-nhap" className="text-violet-700 underline">
          Sign in
        </LocalizedClientLink>
      </p>
    </form>
  )
}
