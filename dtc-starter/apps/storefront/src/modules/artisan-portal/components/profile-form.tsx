"use client"

import { updateArtisanProfile } from "@lib/data/artisan-portal"
import type { Artisan } from "@lib/marketplace-types"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button, Field, Notice, fieldClass } from "../ui"
import GhnPickupFields from "./ghn-pickup-fields"

const FIELDS: { name: keyof Artisan; label: string; hint?: string }[] = [
  { name: "shop_name", label: "Tên gian hàng" },
  { name: "full_name", label: "Họ tên" },
  { name: "phone", label: "Số điện thoại" },
  { name: "pickup_address", label: "Số nhà, tên đường lấy hàng", hint: "Shipper GHN tới đây lấy hàng" },
  { name: "bank_name", label: "Ngân hàng nhận tiền" },
  { name: "bank_account_number", label: "Số tài khoản" },
  { name: "bank_account_name", label: "Chủ tài khoản" },
]

const Save = () => {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" isLoading={pending}>
      Lưu
    </Button>
  )
}

export default function ProfileForm({ artisan }: { artisan: Artisan }) {
  const [state, action] = useActionState(updateArtisanProfile, null)

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Email đăng nhập">
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
      <GhnPickupFields value={state?.values ?? artisan} />
      {!artisan.pickup_ward_code && (
        <Notice tone="warning">
          Hãy chọn Tỉnh / Quận / Phường lấy hàng để Yarnly đặt được shipper GHN tới lấy hàng.
        </Notice>
      )}
      <Field label="Giới thiệu gian hàng">
        <textarea
          name="description"
          rows={3}
          defaultValue={state?.values?.description ?? artisan.description ?? ""}
          className={fieldClass}
        />
      </Field>
      {state?.error && <p className="txt-small text-[#8f4333]">{state.error}</p>}
      {state?.success && <p role="status" className="txt-small text-yarnly-moss">Đã lưu thay đổi.</p>}
      <div className="border-t border-yarnly-line pt-5">
        <Save />
      </div>
    </form>
  )
}
