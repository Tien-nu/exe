import { listCustomRequests } from "@lib/data/marketplace"
import CustomerCustomRequests from "@modules/marketplace/components/customer-custom-requests"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Custom requests",
}

export default async function CustomRequestsPage() {
  const requests = await listCustomRequests()

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Custom requests</h1>
        <p className="text-base-regular">
          The artisan replies once with a price and production time. Accept the quote to add the item to your cart at the agreed price. Regional shipping is calculated at checkout. Custom orders require payment by bank transfer.
        </p>
      </div>
      <CustomerCustomRequests requests={requests} />
    </div>
  )
}
