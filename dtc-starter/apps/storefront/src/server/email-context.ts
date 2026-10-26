import type { Db, Document } from "mongodb"
import type { FullSubOrder } from "./email-templates"
import { escapeHtml } from "./format"

export const STOREFRONT_URL = process.env.STOREFRONT_URL || `${(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8000").replace(/\/$/, "")}/vn`
export type PlannedEmail = { to: string; subject: string; html: string }
type EmailOrder = Document & { id: string; email: string; display_id: number; order_id: string; sub_orders: FullSubOrder[] }
export type MarketplaceEmailService = {
  retrieveMarketplaceOrder(id: string, options?: unknown): Promise<EmailOrder>
  listSubOrders(filter: Document, options?: unknown): Promise<FullSubOrder[]>
}
export type EmailContext = { db: Db; marketplace: MarketplaceEmailService; messages: PlannedEmail[] }

export async function relatedSubOrders(db: Db, filter: Document): Promise<FullSubOrder[]> {
  const rows = await db.collection("sub_orders").aggregate<FullSubOrder>([
    { $match: filter },
    { $lookup: { from: "artisans", localField: "artisan_id", foreignField: "id", as: "artisan" } }, { $unwind: "$artisan" },
    { $lookup: { from: "marketplace_orders", localField: "marketplace_order_id", foreignField: "id", as: "marketplace_order" } }, { $unwind: "$marketplace_order" },
  ]).toArray()
  return rows
}

export function emailContext(db: Db): EmailContext {
  return { db, messages: [], marketplace: {
    listSubOrders: (filter) => relatedSubOrders(db, filter),
    retrieveMarketplaceOrder: async (id) => {
      const order = await db.collection<Omit<EmailOrder, "sub_orders">>("marketplace_orders").findOne({ id })
      if (!order) throw new Error("Email order missing")
      return { ...order, id: String(order.id), email: String(order.email), display_id: Number(order.display_id), order_id: String(order.order_id),
        sub_orders: await relatedSubOrders(db, { marketplace_order_id: id }) }
    },
  } }
}

export async function sendEmail(context: EmailContext, to: string | null | undefined, subject: string, body: string) {
  if (!to) return
  context.messages.push({ to, subject, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937"><h2 style="color:#7c3aed">Yarnly</h2><h3>${escapeHtml(subject)}</h3>${body}<p style="color:#6b7280;font-size:12px">Automated email from Yarnly handmade crochet marketplace.</p></div>` })
}

export async function notifyAdmin(context: EmailContext, subject: string, body: string) {
  const settings = await context.db.collection("marketplace_settings").findOne({})
  const email = settings?.admin_email || process.env.ADMIN_NOTIFY_EMAIL
  if (!email) throw new Error("Admin notification email is not configured")
  await sendEmail(context, email, subject, body)
}

export const paragraph = (value: string) => `<p style="line-height:1.5">${value}</p>`
export const link = (href: string, label: string) => `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>`
