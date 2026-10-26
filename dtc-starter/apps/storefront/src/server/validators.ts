// Input contracts ported from the deployed backend.
import { z } from "zod"
import { provinceName } from "../lib/vietnam-provinces"

const requiredText = (message: string) => z.string().trim().min(1, message)

export const ArtisanProfileSchema = z.object({
  shop_name: requiredText("Please enter your shop name"),
  full_name: requiredText("Please enter your full name"),
  email: z.string().trim().email("Invalid email"),
  phone: requiredText("Please enter your phone number"),
  description: z.string().nullish(),
  avatar_url: z.string().nullish(),
  pickup_address: requiredText("Please enter your pickup address"),
  // Optional legacy address fields; regional shipping uses province only.
  pickup_province_name: z.string({ error: "Please select your pickup province or city" }).trim().refine((value) => Boolean(provinceName(value)), "Please select a valid pickup province or city").transform((value) => provinceName(value)!),
  pickup_district_id: z.coerce.number().int().positive().nullish(),
  pickup_district_name: z.string().nullish(),
  pickup_ward_code: z.string().nullish(),
  pickup_ward_name: z.string().nullish(),
  bank_name: requiredText("Please enter your bank name"),
  bank_account_number: requiredText("Please enter your account number"),
  bank_account_name: requiredText("Please enter the account holder's name"),
})
export type ArtisanProfileBody = z.infer<typeof ArtisanProfileSchema>

// The email is the login and cannot be changed from the profile.
export const ArtisanProfileUpdateSchema = ArtisanProfileSchema.omit({ email: true })
export type ArtisanProfileUpdateBody = z.infer<typeof ArtisanProfileUpdateSchema>

export const AdminCreateArtisanSchema = ArtisanProfileSchema.extend({
  password: z.string().min(8, "Password must contain at least 8 characters"),
})
export type AdminCreateArtisanBody = z.infer<typeof AdminCreateArtisanSchema>

export const ArtisanStatusSchema = z.object({
  status: z.enum(["active", "rejected", "locked"]),
  reason: z.string().nullish(),
})
export type ArtisanStatusBody = z.infer<typeof ArtisanStatusSchema>

const productBase = {
  title: requiredText("Please enter a product name"),
  description: z.string().nullish(),
  fulfillment_type: z.enum(["ready", "made_to_order"]),
  lead_days: z.coerce.number().int().positive().nullish(),
  images: z.array(z.string()).optional(),
  category_ids: z.array(z.string()).optional(),
  status: z.enum(["published", "draft"]).optional(),
}

export const CreateArtisanProductSchema = z.object({
  ...productBase,
  price: z.coerce.number().positive("Price must be greater than 0"),
  stock: z.coerce.number().int().min(0).nullish(),
})
export type CreateArtisanProductBody = z.infer<typeof CreateArtisanProductSchema>

export const UpdateArtisanProductSchema = z.object({
  ...productBase,
  variants: z.array(
    z.object({
      id: z.string(),
      price: z.coerce.number().positive("Price must be greater than 0"),
      stock: z.coerce.number().int().min(0).nullish(),
    })
  ),
})
export type UpdateArtisanProductBody = z.infer<typeof UpdateArtisanProductSchema>

export const UploadSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string(),
        mime_type: z.string().regex(/^image\//, "Only image files are supported"),
        content_base64: z.string(),
      })
    )
    .min(1)
    .max(8),
})
export type UploadBody = z.infer<typeof UploadSchema>

export const ReasonSchema = z.object({
  reason: requiredText("Please enter a reason"),
})
export type ReasonBody = z.infer<typeof ReasonSchema>

export const OptionalReasonSchema = z.object({
  reason: z.string().nullish(),
})
export type OptionalReasonBody = z.infer<typeof OptionalReasonSchema>

export const RespondCustomRequestSchema = z.object({
  accept: z.boolean(),
  price: z.coerce.number().positive().optional(),
  lead_days: z.coerce.number().int().positive().optional(),
  note: z.string().nullish(),
})
export type RespondCustomRequestBody = z.infer<typeof RespondCustomRequestSchema>

export const CreateCustomRequestSchema = z.object({
  product_id: z.string(),
  description: requiredText("Please describe your request"),
  color: z.string().nullish(),
  size: z.string().nullish(),
  quantity: z.coerce.number().int().min(1).max(50).optional(),
})
export type CreateCustomRequestBody = z.infer<typeof CreateCustomRequestSchema>

export const DecideCustomRequestSchema = z.object({
  accept: z.boolean(),
  cart_id: z.string().optional(),
})
export type DecideCustomRequestBody = z.infer<typeof DecideCustomRequestSchema>

export const ShipSchema = z.object({
  carrier: requiredText("Please enter the carrier"),
  tracking_number: requiredText("Please enter the tracking number"),
})
export type ShipBody = z.infer<typeof ShipSchema>

export const PayoutPaidSchema = z.object({
  transaction_ref: requiredText("Please enter the transaction reference"),
})
export type PayoutPaidBody = z.infer<typeof PayoutPaidSchema>

export const SettingsSchema = z.object({
  platform_fee_percent: z.coerce.number().min(0).max(100),
  admin_email: z.string().email().nullish().or(z.literal("")),
  bank_name: z.string().nullish(),
  bank_code: z.string().nullish(),
  bank_account_number: z.string().nullish(),
  bank_account_name: z.string().nullish(),
})
export type SettingsBody = z.infer<typeof SettingsSchema>
