import { createHash, randomUUID } from "node:crypto"
import nodemailer from "nodemailer"
import type { Document } from "mongodb"
import { database, transaction } from "./mongodb"
import { emailContext, relatedSubOrders, sendEmail, notifyAdmin, paragraph, link, STOREFRONT_URL } from "./email-context"
import * as templates from "./email-templates"
import { escapeHtml, formatVnd } from "./format"

export async function planNotifications(event: Document) {
  const db = await database()
  const context = emailContext(db)
  const data = event.data ?? {}
  if (event.type === "sub_order_changed") {
    const [sub] = await relatedSubOrders(db, { id: data.sub_order_id })
    if (!sub) throw new Error("Sub-order email data is missing")
    if (data.action === "paid" || data.action === "placed" && sub.status !== "pending_payment") await templates.emailArtisanNewSubOrder(context, sub)
    if (data.action === "accept") await templates.emailSubOrderAccepted(context, sub)
    if (["cancel", "decline"].includes(data.action)) {
      const raw = await db.collection("sub_orders").findOne({ id: sub.id })
      await templates.emailSubOrderCanceled(context, sub, Boolean(sub.accept_deadline || raw?.accepted_at) && raw?.canceled_by !== "artisan")
    }
    if (data.action === "ready") await templates.emailReadyToShip(context, sub)
    if (data.action === "ship") await templates.emailShipping(context, sub)
    if (data.action === "deliver") await templates.emailDelivered(context, sub)
    if (data.action === "complete") await templates.emailCompleted(context, sub)
    if (data.action === "refunded") await templates.emailRefunded(context, sub)
  } else if (event.type === "payment_changed") {
    if (data.action === "confirm") await templates.emailPaymentConfirmed(context, await context.marketplace.retrieveMarketplaceOrder(data.marketplace_order_id))
  } else if (event.type === "order_placed") {
    const order = await db.collection("marketplace_orders").findOne({ order_id: data.order_id })
    if (!order) throw new Error("Marketplace email data is missing")
    await templates.emailOrderPlaced(context, order.id)
  } else if (["artisan_registered", "artisan_created", "artisan_status_changed"].includes(event.type)) {
    const artisan = await db.collection("artisans").findOne({ id: data.artisan_id })
    if (!artisan) throw new Error("Artisan email data is missing")
    if (event.type === "artisan_registered") await notifyAdmin(context, `New artisan registration: ${artisan.shop_name}`, paragraph(`${escapeHtml(artisan.full_name)} (${escapeHtml(artisan.email)}, ${escapeHtml(artisan.phone)}) registered the shop <b>${escapeHtml(artisan.shop_name)}</b>. Open Admin → Artisans to review it.`))
    else {
      const subject = event.type === "artisan_created" ? "Yarnly created your shop" : data.status === "active" ? "Your shop has been approved" : data.status === "locked" ? "Your shop has been locked" : "Shop registration was not approved"
      await sendEmail(context, artisan.email, subject, paragraph(data.status === "locked" || data.status === "rejected" ? `Reason: ${escapeHtml(data.reason || "none")}` : "You can now sign in to the artisan portal to manage products and orders.") + link(`${STOREFRONT_URL}/kenh-nghe-nhan`, "Open artisan portal"))
    }
  } else if (event.type === "custom_request_changed") {
    const custom = await db.collection("custom_requests").findOne({ id: data.custom_request_id })
    if (!custom) throw new Error("Custom-request email data is missing")
    const artisan = await db.collection("artisans").findOne({ id: custom.artisan_id })
    if (!artisan) throw new Error("Artisan email data is missing")
    if (data.action === "created") await sendEmail(context, artisan.email, `New custom request: ${custom.product_title}`, paragraph(`A customer wants a custom <b>${escapeHtml(custom.product_title)}</b> (${custom.quantity} items).`) + paragraph(`Description: ${escapeHtml(custom.description)}`) + link(`${STOREFRONT_URL}/kenh-nghe-nhan/don-lam-rieng`, "Reply to request"))
    else if (data.action === "responded") await sendEmail(context, custom.customer_email, `${artisan.shop_name} ${custom.status === "quoted" ? "sent a quote" : "declined"} custom request: ${custom.product_title}`, (custom.status === "quoted" ? paragraph(`Price: <b>${formatVnd(custom.quoted_price * custom.quantity)}</b> cho ${custom.quantity} items, production time: <b>${custom.quoted_lead_days} days</b>.`) : "") + paragraph(`Message: ${escapeHtml(custom.artisan_note || "")}`) + link(`${STOREFRONT_URL}/account/yeu-cau-lam-rieng`, "View request"))
    else if (data.action === "decided") await sendEmail(context, artisan.email, `Customer ${["accepted", "ordered"].includes(custom.status) ? "accepted" : "declined"} quote: ${custom.product_title}`, paragraph(["accepted", "ordered"].includes(custom.status) ? "The customer accepted and is checking out. You will receive the order once checkout is complete." : "The customer declined your quote."))
  } else if (event.type === "payout_generated") {
    await notifyAdmin(context, "New artisan payouts are ready", paragraph("Open Admin → Payouts to review, transfer funds, and mark them as paid."))
  } else if (event.type === "payout_paid") {
    const payout = await db.collection("payouts").findOne({ id: data.payout_id })
    const artisan = payout && await db.collection("artisans").findOne({ id: payout.artisan_id })
    if (!payout || !artisan) throw new Error("Payout email data is missing")
    await sendEmail(context, artisan.email, `Yarnly transferred ${formatVnd(payout.net_amount)} to you`, paragraph(`Yarnly transferred <b>${formatVnd(payout.net_amount)}</b> cho ${payout.sub_order_count} completed orders.`) + paragraph(`Items total: ${formatVnd(payout.gross_amount)} – marketplace fee ${payout.fee_percent}%: ${formatVnd(payout.fee_amount)}<br/>Bank: ${escapeHtml(payout.bank_name)}<br/>Account: ${escapeHtml(payout.bank_account_number)}<br/>Transaction reference: ${escapeHtml(payout.transaction_ref)}`))
  } else if (event.type === "order_transfer_requested") {
    await sendEmail(context, data.to, "Request to transfer an order to a Yarnly account", paragraph("An account has requested access to your order. Only accept if you want to transfer the ability to view and manage it.") + link(`${STOREFRONT_URL}/order/${encodeURIComponent(data.order_id)}/transfer/${encodeURIComponent(data.code)}`, "Review order transfer request"))
  } else if (event.type === "email_verification") {
    await sendEmail(context, data.to, "Verify your Yarnly email", link(`${STOREFRONT_URL}/verify-account?token=${encodeURIComponent(data.code)}`, "Verify email"))
  } else throw new Error("Unknown outbox event")
  return context.messages
}

export async function processOutbox(limit = 20) {
  const db = await database()
  const deadline = Date.now() + 25_000
  let planned = 0, sent = 0, failed = 0
  for (let index = 0; index < limit; index++) {
    if (Date.now() >= deadline) break
    const lease = randomUUID(), now = new Date()
    const event = await db.collection("outbox").findOneAndUpdate({ type: { $ne: "send_mail" },
      status: { $in: ["pending", "processing"] }, next_attempt_at: { $lte: now },
      $or: [{ lease_until: { $exists: false } }, { lease_until: { $lte: now } }],
    }, { $set: { status: "processing", lease_id: lease, lease_until: new Date(+now + 120_000) }, $inc: { attempts: 1 } }, { sort: { created_at: 1 }, returnDocument: "after" })
    if (!event) break
    try {
      const messages = await planNotifications(event)
      await transaction(async (db, session) => {
        const claimed = await db.collection("outbox").updateOne({ _id: event._id, lease_id: lease, status: "processing" }, { $set: { status: "done", completed_at: new Date() }, $unset: { lease_until: "" } }, { session })
        if (!claimed.modifiedCount) throw new Error("Outbox lease changed")
        for (let i = 0; i < messages.length; i++) {
          const key = createHash("sha256").update(`${event.deduplication_key}:${i}`).digest("hex")
          await db.collection("outbox").updateOne({ deduplication_key: `mail:${key}` }, { $setOnInsert: { type: "send_mail", deduplication_key: `mail:${key}`,
            data: messages[i], status: "pending", attempts: 0, next_attempt_at: new Date(), created_at: new Date() } }, { upsert: true, session })
        }
      })
      planned++
    } catch {
      failed++
      await db.collection("outbox").updateOne({ _id: event._id, lease_id: lease }, { $set: {
        status: event.attempts >= 10 ? "failed" : "pending", last_error: "Notification planning failed",
        next_attempt_at: new Date(Date.now() + Math.min(6 * 60 * 60_000, 15000 * 2 ** Math.min(event.attempts, 10))),
      }, $unset: { lease_until: "" } })
    }
  }
  if (process.env.EMAIL_DELIVERY_ENABLED !== "true") return { planned, sent, failed, delivery_enabled: false }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) throw new Error("SMTP is not configured")
  const port = Number(process.env.SMTP_PORT || 465)
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 10_000 })
  try {
    for (let index = 0; index < limit; index++) {
      if (Date.now() >= deadline) break
      const lease = randomUUID(), now = new Date()
      const mail = await db.collection("outbox").findOneAndUpdate({ type: "send_mail", status: { $in: ["pending", "processing"] },
        next_attempt_at: { $lte: now }, $or: [{ lease_until: { $exists: false } }, { lease_until: { $lte: now } }],
      }, { $set: { status: "processing", lease_id: lease, lease_until: new Date(+now + 120_000) }, $inc: { attempts: 1 } }, { sort: { created_at: 1 }, returnDocument: "after" })
      if (!mail) break
      try {
        await transport.sendMail({ from: process.env.SMTP_FROM, to: mail.data.to, subject: mail.data.subject, html: mail.data.html,
          messageId: `<${mail.deduplication_key.replace("mail:", "")}@yarnly>` })
        await db.collection("outbox").updateOne({ _id: mail._id, lease_id: lease }, { $set: { status: "done", completed_at: new Date() }, $unset: { lease_until: "" } })
        sent++
      } catch {
        failed++
        await db.collection("outbox").updateOne({ _id: mail._id, lease_id: lease }, { $set: { status: mail.attempts >= 10 ? "failed" : "pending",
          last_error: "SMTP delivery failed", next_attempt_at: new Date(Date.now() + Math.min(6 * 60 * 60_000, 15000 * 2 ** Math.min(mail.attempts, 10))) }, $unset: { lease_until: "" } })
      }
    }
  } finally { transport.close() }
  return { planned, sent, failed, delivery_enabled: true }
}
