import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Tabs,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useFormPrompt } from "../../lib/form-prompt"
import {
  GHN_STATUS,
  PAYMENT_STATUS,
  SUB_ORDER_STATUS,
  api,
  formatDate,
  formatDateTime,
  formatVnd,
} from "../../lib/marketplace"

type SubOrder = {
  id: string
  code: string
  status: string
  subtotal: number
  // Shipping the customer paid at checkout for this parcel.
  shipping_charged: number | null
  is_custom: boolean
  due_date: string | null
  accept_deadline: string | null
  carrier: string | null
  tracking_number: string | null
  carrier_status: string | null
  shipping_fee: number | null
  refund_status: string
  cancel_reason: string | null
  shipping_name: string | null
  shipping_phone: string | null
  shipping_address: string | null
  created_at: string
  items: { id: string; title: string; variant_title: string | null; quantity: number }[]
  artisan: {
    shop_name: string
    phone: string
    pickup_address: string
    pickup_ward_name: string | null
    pickup_district_name: string | null
    pickup_province_name: string | null
  }
  marketplace_order: { display_id: number; email: string; payment_method: string }
}

type MarketplaceOrder = {
  id: string
  display_id: number
  email: string
  items_total: number
  payment_status: string
  payment_deadline: string | null
  transfer_submitted_at: string | null
  created_at: string
  sub_orders: {
    id: string
    code: string
    status: string
    subtotal: number
    shipping_charged: number | null
  }[]
}

const useRefresh = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["mp-orders"] })
}

const useAction = () => {
  const refresh = useRefresh()

  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api(path, { method: "POST", body: body ?? {} }),
    onSuccess: () => {
      toast.success("Updated")
      refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

/** What the customer pays for a sub-order: goods + the shipping charged. */
const paid = (sub: { subtotal: number; shipping_charged: number | null }) =>
  Number(sub.subtotal) + Number(sub.shipping_charged ?? 0)

const Empty = ({ children }: { children: string }) => (
  <Text className="p-6 text-ui-fg-subtle">{children}</Text>
)

const ItemsCell = ({ subOrder }: { subOrder: SubOrder }) => (
  <div className="flex flex-col py-2">
    {subOrder.items.map((item) => (
      <Text key={item.id} size="small">
        {item.quantity} × {item.title}
        {item.variant_title ? ` (${item.variant_title})` : ""}
      </Text>
    ))}
    {subOrder.is_custom && (
      <Text size="xsmall" className="text-ui-fg-interactive">
        Custom made
      </Text>
    )}
  </div>
)

// ---- Bank transfers ------------------------------------------------------

const TransfersTab = () => {
  const action = useAction()
  const prompt = usePrompt()
  const [dialog, ask] = useFormPrompt()
  const { data, isLoading } = useQuery({
    queryKey: ["mp-orders", "transfers"],
    queryFn: () =>
      api<{ orders: MarketplaceOrder[] }>(
        "/orders?payment_status=transfer_submitted&payment_status=awaiting_transfer"
      ),
    refetchInterval: 30000,
  })

  if (isLoading) return <Empty>Loading…</Empty>
  if (!data?.orders.length) return <Empty>No orders are awaiting transfer confirmation.</Empty>

  return (
    <>
    {dialog}
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Order</Table.HeaderCell>
          <Table.HeaderCell>Customer</Table.HeaderCell>
          <Table.HeaderCell>Transfer reference</Table.HeaderCell>
          <Table.HeaderCell>Amount</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.orders.map((order) => {
          const amount = order.sub_orders
            .filter((sub) => sub.status !== "canceled")
            .reduce((sum, sub) => sum + paid(sub), 0)
          const status = PAYMENT_STATUS[order.payment_status]

          return (
            <Table.Row key={order.id}>
              <Table.Cell>
                #{order.display_id}
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {formatDateTime(order.created_at)}
                </Text>
              </Table.Cell>
              <Table.Cell>{order.email}</Table.Cell>
              <Table.Cell>
                <Text weight="plus">YARNLY {order.display_id}</Text>
              </Table.Cell>
              <Table.Cell>{formatVnd(amount)}</Table.Cell>
              <Table.Cell>
                <StatusBadge color={status.color}>{status.label}</StatusBadge>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {order.payment_status === "transfer_submitted"
                    ? `Reported at ${formatDateTime(order.transfer_submitted_at)}`
                    : `Deadline ${formatDateTime(order.payment_deadline)}`}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-2">
                  <Button
                    size="small"
                    onClick={async () => {
                      const confirmed = await prompt({
                        title: `Confirm receipt of ${formatVnd(amount)}?`,
                        description: `Only confirm when your statement includes a transaction with reference "YARNLY ${order.display_id}".`,
                        confirmText: "Payment received",
                        cancelText: "Cancel",
                      })
                      if (confirmed) {
                        action.mutate({ path: `/orders/${order.id}/confirm-payment` })
                      }
                    }}
                  >
                    Payment received
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={async () => {
                      const values = await ask({
                        title: `Cancel order #${order.display_id} because payment was not received?`,
                        description: "Suborders awaiting payment will be canceled and the customer will receive an email explaining why.",
                        fields: [
                          {
                            name: "reason",
                            label: "Reason sent to customer",
                            defaultValue: "Yarnly did not receive the bank transfer",
                            multiline: true,
                          },
                        ],
                        confirmText: "Cancel order",
                        variant: "danger",
                      })
                      if (values) {
                        action.mutate({
                          path: `/orders/${order.id}/reject-payment`,
                          body: { reason: values.reason },
                        })
                      }
                    }}
                  >
                    Payment not received
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table>
    </>
  )
}

// ---- Sub-order lists -----------------------------------------------------

const useSubOrders = (query: string) =>
  useQuery({
    queryKey: ["mp-orders", "sub-orders", query],
    queryFn: () => api<{ sub_orders: SubOrder[] }>(`/sub-orders?${query}`),
    refetchInterval: 30000,
  })

const useGhnEnabled = () =>
  useQuery({
    queryKey: ["mp-settings"],
    queryFn: () => api<{ ghn_enabled: boolean }>("/settings"),
  }).data?.ghn_enabled ?? false

type GhnQuote = {
  total_fee: number
  expected_delivery_time: string | null
  cod_amount: number
  from: { name: string; address: string; ward_name: string; district_name: string; province_name: string }
  to: { name: string; phone: string; address: string }
}

/** Quotes first, then books a real GHN pickup only after the admin confirms. */
const GhnButton = ({ subOrder }: { subOrder: SubOrder }) => {
  const refresh = useRefresh()
  const prompt = usePrompt()
  const [busy, setBusy] = useState(false)

  const book = async () => {
    setBusy(true)
    try {
      const { quote } = await api<{ quote: GhnQuote }>(`/sub-orders/${subOrder.id}/ghn-quote`, {
        method: "POST",
        body: {},
      })
      const confirmed = await prompt({
        title: `Create a GHN shipment for order ${subOrder.code}?`,
        description:
          `Pickup: ${quote.from.name}, ${quote.from.address}, ${quote.from.ward_name}, ${quote.from.district_name}, ${quote.from.province_name}. ` +
          `Delivery: ${quote.to.name} (${quote.to.phone}), ${quote.to.address}. ` +
          `Shipping fee ${formatVnd(quote.total_fee)} (paid by customer on delivery)` +
          (quote.cod_amount ? `, collect payment for items ${formatVnd(quote.cod_amount)}.` : ", no collection (paid by bank transfer).") +
          (quote.expected_delivery_time ? ` Estimated delivery ${formatDate(quote.expected_delivery_time)}.` : ""),
        confirmText: "Book GHN pickup",
        cancelText: "Cancel",
      })
      if (!confirmed) return
      const created = await api<{ order_code: string }>(`/sub-orders/${subOrder.id}/ghn`, {
        method: "POST",
        body: {},
      })
      toast.success(`Created GHN shipment ${created.order_code}`)
      refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="small" isLoading={busy} onClick={book}>
      Create GHN shipment
    </Button>
  )
}

const ReadyToShipTab = () => {
  const action = useAction()
  const [dialog, ask] = useFormPrompt()
  const ghnEnabled = useGhnEnabled()
  const { data, isLoading } = useSubOrders("status=ready_to_ship")

  if (isLoading) return <Empty>Loading…</Empty>
  if (!data?.sub_orders.length) return <Empty>No orders are awaiting shipment creation.</Empty>

  return (
    <>
    {dialog}
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Order</Table.HeaderCell>
          <Table.HeaderCell>Pickup address</Table.HeaderCell>
          <Table.HeaderCell>Delivery address</Table.HeaderCell>
          <Table.HeaderCell>Items</Table.HeaderCell>
          <Table.HeaderCell>Collection</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.sub_orders.map((sub) => (
          <Table.Row key={sub.id}>
            <Table.Cell>{sub.code}</Table.Cell>
            <Table.Cell>
              <Text size="small" weight="plus">
                {sub.artisan.shop_name} – {sub.artisan.phone}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {[sub.artisan.pickup_address, sub.artisan.pickup_ward_name, sub.artisan.pickup_district_name, sub.artisan.pickup_province_name]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
              {!sub.artisan.pickup_ward_name && (
                <Text size="xsmall" className="text-ui-fg-error">
                  The artisan has not selected a pickup ward/district. A GHN shipment cannot be created yet
                </Text>
              )}
            </Table.Cell>
            <Table.Cell>
              <Text size="small" weight="plus">
                {sub.shipping_name} – {sub.shipping_phone}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {sub.shipping_address}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <ItemsCell subOrder={sub} />
            </Table.Cell>
            <Table.Cell>
              {sub.shipping_charged === null
                ? sub.marketplace_order.payment_method === "cod"
                  ? `Thu ${formatVnd(sub.subtotal)} + shipping (legacy order)`
                  : "Shipping only (legacy order)"
                : sub.marketplace_order.payment_method === "cod"
                  ? `Thu ${formatVnd(paid(sub))}`
                  : "Prepaid – no collection"}
            </Table.Cell>
            <Table.Cell>
              <div className="flex flex-col gap-y-2">
                {ghnEnabled && <GhnButton subOrder={sub} />}
                <Button
                  size="small"
                  variant="secondary"
                  onClick={async () => {
                    const values = await ask({
                      title: `Enter shipment details for order ${sub.code}`,
                      description: "Use this for another carrier or a shipment booked outside the system.",
                      fields: [
                        { name: "carrier", label: "Carrier", placeholder: "VD: GHTK, Viettel Post", required: true },
                        { name: "tracking_number", label: "Tracking number", required: true },
                      ],
                      confirmText: "Save shipment",
                    })
                    if (values) {
                      action.mutate({
                        path: `/sub-orders/${sub.id}/ship`,
                        body: { carrier: values.carrier, tracking_number: values.tracking_number },
                      })
                    }
                  }}
                >
                  Enter manually
                </Button>
              </div>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
    </>
  )
}

const ShippingTab = () => {
  const action = useAction()
  const prompt = usePrompt()
  const { data, isLoading } = useSubOrders("status=shipping")

  if (isLoading) return <Empty>Loading…</Empty>
  if (!data?.sub_orders.length) return <Empty>No orders are in transit.</Empty>

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Order</Table.HeaderCell>
          <Table.HeaderCell>Shipment</Table.HeaderCell>
          <Table.HeaderCell>Delivery address</Table.HeaderCell>
          <Table.HeaderCell>Items</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.sub_orders.map((sub) => (
          <Table.Row key={sub.id}>
            <Table.Cell>{sub.code}</Table.Cell>
            <Table.Cell>
              <Text size="small">
                {sub.carrier} –{" "}
                {sub.carrier === "GHN" ? (
                  <a
                    href={`https://donhang.ghn.vn/?order_code=${sub.tracking_number}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ui-fg-interactive underline"
                  >
                    {sub.tracking_number}
                  </a>
                ) : (
                  sub.tracking_number
                )}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {[
                  sub.carrier_status && (GHN_STATUS[sub.carrier_status] ?? sub.carrier_status),
                  sub.shipping_fee && `ship ${formatVnd(sub.shipping_fee)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Text size="small">
                {sub.shipping_name} – {sub.shipping_phone}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <ItemsCell subOrder={sub} />
            </Table.Cell>
            <Table.Cell>
              <div className="flex flex-col gap-y-2">
                <Button
                  size="small"
                  onClick={() => action.mutate({ path: `/sub-orders/${sub.id}/deliver` })}
                >
                  Delivered
                </Button>
                {sub.carrier === "GHN" && (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={async () => {
                      const ok = await prompt({
                        title: `Cancel GHN shipment ${sub.tracking_number}?`,
                        description: "You can only cancel before pickup. The suborder will return to \"Awaiting shipment\" so a new shipment can be created.",
                        confirmText: "Cancel shipment",
                        cancelText: "Keep order",
                        variant: "danger",
                      })
                      if (ok) {
                        action.mutate({ path: `/sub-orders/${sub.id}/ghn-cancel` })
                      }
                    }}
                  >
                    Cancel GHN shipment
                  </Button>
                )}
              </div>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

const RefundsTab = () => {
  const action = useAction()
  const { data, isLoading } = useSubOrders("refund_status=pending")

  if (isLoading) return <Empty>Loading…</Empty>
  if (!data?.sub_orders.length) return <Empty>No refunds are pending.</Empty>

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Order</Table.HeaderCell>
          <Table.HeaderCell>Customer</Table.HeaderCell>
          <Table.HeaderCell>Refund amount</Table.HeaderCell>
          <Table.HeaderCell>Cancellation reason</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.sub_orders.map((sub) => (
          <Table.Row key={sub.id}>
            <Table.Cell>{sub.code}</Table.Cell>
            <Table.Cell>{sub.marketplace_order.email}</Table.Cell>
            <Table.Cell>{formatVnd(paid(sub))}</Table.Cell>
            <Table.Cell>{sub.cancel_reason}</Table.Cell>
            <Table.Cell>
              <Button
                size="small"
                onClick={() => action.mutate({ path: `/sub-orders/${sub.id}/refunded` })}
              >
                Refunded
              </Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

const AllSubOrdersTab = () => {
  const action = useAction()
  const [dialog, ask] = useFormPrompt()
  const { data, isLoading } = useSubOrders("")

  if (isLoading) return <Empty>Loading…</Empty>
  if (!data?.sub_orders.length) return <Empty>No orders yet.</Empty>

  return (
    <>
    {dialog}
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Order</Table.HeaderCell>
          <Table.HeaderCell>Artisans</Table.HeaderCell>
          <Table.HeaderCell>Items</Table.HeaderCell>
          <Table.HeaderCell>Item total</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.sub_orders.map((sub) => {
          const status = SUB_ORDER_STATUS[sub.status]
          const canCancel = !["completed", "canceled"].includes(sub.status)

          return (
            <Table.Row key={sub.id}>
              <Table.Cell>
                {sub.code}
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {formatDateTime(sub.created_at)} ·{" "}
                  {sub.marketplace_order.payment_method === "cod" ? "COD" : "CK"}
                </Text>
              </Table.Cell>
              <Table.Cell>{sub.artisan.shop_name}</Table.Cell>
              <Table.Cell>
                <ItemsCell subOrder={sub} />
              </Table.Cell>
              <Table.Cell>
                {formatVnd(sub.subtotal)}
                <Text size="xsmall" className="text-ui-fg-subtle">
                  + ship {formatVnd(sub.shipping_charged ?? 0)}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <StatusBadge color={status?.color ?? "grey"}>
                  {status?.label ?? sub.status}
                </StatusBadge>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {sub.status === "pending_acceptance" &&
                    `Acceptance deadline ${formatDateTime(sub.accept_deadline)}`}
                  {sub.status === "processing" && sub.due_date &&
                    `Production deadline ${formatDate(sub.due_date)}`}
                  {sub.status === "canceled" && sub.cancel_reason}
                </Text>
              </Table.Cell>
              <Table.Cell>
                {canCancel && (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={async () => {
                      const values = await ask({
                        title: `Cancel order ${sub.code}?`,
                        description: "The customer and artisan will receive an email explaining why. If the customer has paid, the order will appear under Pending refunds.",
                        fields: [{ name: "reason", label: "Cancellation reason", multiline: true, required: true }],
                        confirmText: "Cancel order",
                        variant: "danger",
                      })
                      if (values) {
                        action.mutate({
                          path: `/sub-orders/${sub.id}/cancel`,
                          body: { reason: values.reason },
                        })
                      }
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </Table.Cell>
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table>
    </>
  )
}

const MarketplaceOrdersPage = () => (
  <Container className="p-0">
    <div className="px-6 py-4">
      <Heading>Marketplace Orders</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Confirm bank transfers, arrange shipments when artisans finish, and refund canceled orders.
      </Text>
    </div>
    <Tabs defaultValue="transfers">
      <Tabs.List className="px-6">
        <Tabs.Trigger value="transfers">Pending transfer confirmation</Tabs.Trigger>
        <Tabs.Trigger value="ready">Awaiting shipment</Tabs.Trigger>
        <Tabs.Trigger value="shipping">Shipping</Tabs.Trigger>
        <Tabs.Trigger value="refunds">Pending refunds</Tabs.Trigger>
        <Tabs.Trigger value="all">All suborders</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="transfers" className="pt-2">
        <TransfersTab />
      </Tabs.Content>
      <Tabs.Content value="ready" className="pt-2">
        <ReadyToShipTab />
      </Tabs.Content>
      <Tabs.Content value="shipping" className="pt-2">
        <ShippingTab />
      </Tabs.Content>
      <Tabs.Content value="refunds" className="pt-2">
        <RefundsTab />
      </Tabs.Content>
      <Tabs.Content value="all" className="pt-2">
        <AllSubOrdersTab />
      </Tabs.Content>
    </Tabs>
  </Container>
)

export const config = defineRouteConfig({
  label: "Marketplace Orders",
  icon: ShoppingBag,
})

export default MarketplaceOrdersPage
