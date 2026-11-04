export type PublicArtisan = {
  id: string
  handle: string
  shop_name: string
  description: string | null
  avatar_url: string | null
}

export type ProductArtisan = {
  artisan: PublicArtisan | null
  fulfillment_type: "ready" | "made_to_order"
  lead_days: number | null
}

export type SubOrderItem = {
  id: string
  line_item_id: string
  product_id: string | null
  title: string
  variant_title: string | null
  thumbnail: string | null
  made_to_order: boolean
  quantity: number
  unit_price: number
  total: number
}

export type SubOrderStatus =
  | "pending_payment"
  | "pending_acceptance"
  | "processing"
  | "ready_to_ship"
  | "shipping"
  | "delivered"
  | "completed"
  | "canceled"

type SubOrderBase = {
  id: string
  code: string
  status: SubOrderStatus
  status_label: string
  is_custom: boolean
  made_to_order: boolean
  lead_days: number | null
  subtotal: number
  carrier: string | null
  tracking_number: string | null
  tracking_url: string | null
  carrier_status: string | null
  carrier_status_label: string | null
  // Paid by the customer at checkout for this parcel (GHN quote); null for
  // older orders, whose shipping is paid to the shipper on delivery.
  shipping_charged: number | null
  shipping_fee: number | null
  expected_delivery_at: string | null
  canceled_by: string | null
  cancel_reason: string | null
  items: SubOrderItem[]
  created_at: string
  accept_deadline: string | null
  accepted_at: string | null
  due_date: string | null
  ready_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  complete_at: string | null
  completed_at: string | null
  canceled_at: string | null
}

export type CustomerSubOrder = SubOrderBase & {
  refund_status: "not_required" | "pending" | "refunded"
  artisan: PublicArtisan | null
}

export type ArtisanSubOrder = SubOrderBase & {
  payment_method: "cod" | "bank_transfer"
  /** "simulation" orders (coursework QR) are never paid out. */
  payment_mode?: "bank" | "simulation"
  payout_id: string | null
  custom_request: {
    description: string
    color: string | null
    size: string | null
    quantity: number
    quoted_price: number
    quoted_lead_days: number
    artisan_note: string | null
  } | null
}

export type MarketplaceOrder = {
  payment_mode?: "bank" | "simulation"
  payment_provider?: "payos" | "sepay" | "simulation" | null
  payment_url?: string | null
  qr_payment_token?: string | null
  id: string
  order_id: string
  display_id: number
  payment_method: "cod" | "bank_transfer"
  payment_status:
    | "cod"
    | "awaiting_transfer"
    | "transfer_submitted"
    | "paid"
    | "expired"
    | "rejected"
  payment_deadline: string | null
  transfer_submitted_at: string | null
  paid_at: string | null
  items_total: number
  shipping_total: number
  amount_to_transfer: number
  transfer_content: string
  bank: {
    name: string | null
    code: string | null
    account_number: string | null
    account_name: string | null
  } | null
  created_at: string
  sub_orders: CustomerSubOrder[]
}

export type CustomRequestStatus =
  | "pending"
  | "quoted"
  | "artisan_declined"
  | "accepted"
  | "customer_declined"
  | "ordered"

export type CustomRequest = {
  id: string
  status: CustomRequestStatus
  product_id: string
  product_title: string
  thumbnail: string | null
  description: string
  color: string | null
  size: string | null
  quantity: number
  quoted_price: number | null
  quoted_lead_days: number | null
  artisan_note: string | null
  responded_at: string | null
  decided_at: string | null
  order_id: string | null
  created_at: string
  artisan?: PublicArtisan | null
  customer_name?: string | null
}

export type Artisan = PublicArtisan & {
  full_name: string
  email: string
  phone: string
  pickup_address: string
  pickup_province_name: string | null
  pickup_district_id: number | null
  pickup_district_name: string | null
  pickup_ward_code: string | null
  pickup_ward_name: string | null
  bank_name: string
  bank_account_number: string
  bank_account_name: string
  status: "pending" | "active" | "rejected" | "locked"
  status_reason: string | null
}

export type ArtisanProduct = {
  id: string
  title: string
  handle: string
  description: string | null
  status: "published" | "draft" | string
  thumbnail: string | null
  images: string[]
  categories: { id: string; name: string }[]
  fulfillment_type: "ready" | "made_to_order"
  lead_days: number | null
  hidden_by_lock: boolean
  created_at: string
  variants: {
    id: string
    title: string
    price: number
    stock: number
    reserved: number
  }[]
}

export type ArtisanDashboard = {
  sub_orders_by_status: Partial<Record<SubOrderStatus, number>>
  pending_custom_requests: number
  revenue: {
    completed_total: number
    awaiting_payout: number
    pending_payout: number
    paid_out: number
  }
}

export type Payout = {
  id: string
  period_start: string
  period_end: string
  sub_order_count: number
  gross_amount: number
  fee_percent: number
  fee_amount: number
  net_amount: number
  bank_name: string
  bank_account_number: string
  status: "pending" | "paid"
  transaction_ref: string | null
  paid_at: string | null
}

export const CUSTOM_REQUEST_LABELS: Record<CustomRequestStatus, string> = {
  pending: "Awaiting artisan response",
  quoted: "Quote received",
  artisan_declined: "Declined by artisan",
  accepted: "Accepted — in your cart",
  customer_declined: "You declined",
  ordered: "Order placed",
}
