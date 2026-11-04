"use client"

import { artisanLogin, artisanRegister } from "@lib/data/artisan-portal"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams } from "next/navigation"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button, Field, Notice, fieldClass, linkClass } from "../ui"
import GhnPickupFields from "./ghn-pickup-fields"

const Submit = ({ children }: { children: React.ReactNode }) => {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" isLoading={pending}>
      {children}
    </Button>
  )
}

const FormError = ({ error }: { error?: string | null }) =>
  error ? (
    <p role="alert" className="rounded-xl border border-[#ecc4ba] bg-[#fbeae5] px-4 py-3 txt-small text-[#8f4333]">
      {error}
    </p>
  ) : null

export const ArtisanLoginForm = () => {
  const { countryCode } = useParams() as { countryCode: string }
  const [state, action] = useActionState(artisanLogin, null)

  return (
    <form action={action} className="flex flex-col gap-5">
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
      <Field label="Mật khẩu">
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={fieldClass}
        />
      </Field>
      <FormError error={state?.error} />
      <Submit>Đăng nhập</Submit>
      <p className="border-t border-yarnly-line pt-5 txt-small text-center text-yarnly-muted">
        Chưa có gian hàng?{" "}
        <LocalizedClientLink href="/kenh-nghe-nhan/dang-ky" className={linkClass}>
          Đăng ký làm nghệ nhân
        </LocalizedClientLink>
      </p>
    </form>
  )
}

type RegisterField = {
  name: string
  label: string
  type?: string
  hint?: string
  autoComplete?: string
}

const REGISTER_GROUPS: { title: string; fields: RegisterField[]; pickup?: boolean }[] = [
  {
    title: "Gian hàng và tài khoản",
    fields: [
      { name: "shop_name", label: "Tên gian hàng" },
      { name: "full_name", label: "Họ tên", autoComplete: "name" },
      { name: "email", label: "Email (dùng để đăng nhập)", type: "email", autoComplete: "email" },
      {
        name: "password",
        label: "Mật khẩu",
        type: "password",
        hint: "Tối thiểu 8 ký tự",
        autoComplete: "new-password",
      },
      { name: "phone", label: "Số điện thoại", type: "tel", autoComplete: "tel" },
    ],
  },
  {
    title: "Địa chỉ lấy hàng",
    pickup: true,
    fields: [
      {
        name: "pickup_address",
        label: "Số nhà, tên đường lấy hàng",
        hint: "Shipper GHN sẽ tới đây lấy hàng",
        autoComplete: "street-address",
      },
    ],
  },
  {
    title: "Tài khoản nhận tiền",
    fields: [
      { name: "bank_name", label: "Ngân hàng nhận tiền" },
      { name: "bank_account_number", label: "Số tài khoản" },
      { name: "bank_account_name", label: "Chủ tài khoản" },
    ],
  },
]

export const ArtisanRegisterForm = () => {
  const { countryCode } = useParams() as { countryCode: string }
  const [state, action] = useActionState(artisanRegister, null)

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="country_code" value={countryCode} />
      {REGISTER_GROUPS.map((group, index) => (
        <fieldset key={group.title} className="flex flex-col gap-4">
          <legend className="mb-4 flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yarnly-sage text-[12px] font-medium text-yarnly-moss">
              {index + 1}
            </span>
            <span className="font-yarnly text-lg tracking-[-0.01em]">{group.title}</span>
          </legend>
          <div className="grid grid-cols-1 gap-4 xsmall:grid-cols-2">
            {group.fields.map((field) => (
              <Field
                key={field.name}
                label={field.label}
                hint={field.hint}
                className={group.pickup ? "xsmall:col-span-2" : undefined}
              >
                <input
                  name={field.name}
                  type={field.type ?? "text"}
                  required
                  autoComplete={field.autoComplete}
                  defaultValue={field.type === "password" ? undefined : state?.values?.[field.name] ?? ""}
                  className={fieldClass}
                />
              </Field>
            ))}
          </div>
          {group.pickup && <GhnPickupFields value={state?.values} />}
        </fieldset>
      ))}
      <Field label="Giới thiệu gian hàng (tuỳ chọn)">
        <textarea
          name="description"
          rows={3}
          defaultValue={state?.values?.description ?? ""}
          className={fieldClass}
        />
      </Field>
      <Notice>
        Yarnly nhận tiền từ khách và chuyển cho bạn mỗi thứ Hai (phí sàn hiện tại 0%). Tài khoản
        cần Admin duyệt trước khi bán.
      </Notice>
      <FormError error={state?.error} />
      <Submit>Đăng ký</Submit>
      <p className="border-t border-yarnly-line pt-5 txt-small text-center text-yarnly-muted">
        Đã có gian hàng?{" "}
        <LocalizedClientLink href="/kenh-nghe-nhan/dang-nhap" className={linkClass}>
          Đăng nhập
        </LocalizedClientLink>
      </p>
    </form>
  )
}
