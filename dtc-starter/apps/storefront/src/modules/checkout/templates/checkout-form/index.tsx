import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) return null

  // Address submission owns shipping quotes. A failed quote must not hide
  // the entire form or prevent customers from correcting their address.
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} />
      {paymentMethods?.length ? (
        <>
          <Payment
            cart={cart}
            availablePaymentMethods={paymentMethods}
            qrPayment={false}
          />
          <Review cart={cart} />
        </>
      ) : (
        <section
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
        >
          <h2 className="font-semibold">Unable to load payment methods</h2>
          <p className="mt-2">
            You can still edit your address. Reload the page to try again.
          </p>
          <a className="mt-3 inline-block underline" href="?step=payment">
            Retry payment
          </a>
        </section>
      )}
    </div>
  )
}
