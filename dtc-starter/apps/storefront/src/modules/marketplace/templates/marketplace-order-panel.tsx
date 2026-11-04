import { getMarketplaceOrder } from "@lib/data/marketplace"
import { Heading } from "@modules/common/components/ui"
import BankTransferBox from "../components/bank-transfer-box"
import SubOrderList from "../components/sub-order-list"

/** Payment box and per-artisan sub-orders of one order. */
export default async function MarketplaceOrderPanel({ orderId, autoOpenPayment = false }: { orderId: string; autoOpenPayment?: boolean }) {
  const order = await getMarketplaceOrder(orderId)

  if (!order) {
    return (
      <p className="txt-medium text-ui-fg-subtle">
        Your order is being split between artisans. Reload the page in a moment.
      </p>
    )
  }

  const shops = Array.from(
    new Set(order.sub_orders.map((sub) => sub.artisan?.shop_name).filter(Boolean))
  ).join(", ")

  return (
    <div className="flex flex-col gap-4" data-testid="marketplace-order">
      <BankTransferBox order={order} autoOpenPayment={autoOpenPayment} />
      <Heading level="h2" className="text-2xl-regular">
        {order.sub_orders.length > 1
          ? `This order contains ${order.sub_orders.length} parcels from ${shops}, delivered separately`
          : "Order status"}
      </Heading>
      <SubOrderList subOrders={order.sub_orders} />
    </div>
  )
}
