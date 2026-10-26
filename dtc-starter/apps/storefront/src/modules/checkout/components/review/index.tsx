"use client"

import { Heading, Text, clx } from "@modules/common/components/ui"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards && ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 && cart?.total === 0
  )

  const previousStepsCompleted = true

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full flex flex-col gap-y-4">
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <Text className="txt-medium-plus font-semibold mb-2">Delivery status</Text>
                <Text className="txt-medium text-ui-fg-subtle">
                  Method: <span className="text-black font-medium">{cart.shipping_methods?.[0]?.name || "Standard"}</span>
                </Text>
                <Text className="txt-medium text-ui-fg-subtle mt-1">
                  Deliver to: <span className="text-black font-medium">{cart.shipping_address?.address_1}, {cart.shipping_address?.city}, {cart.shipping_address?.province}</span>
                </Text>
              </div>

              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <Text className="txt-medium-plus font-semibold mb-3">Ordered items</Text>
                <div className="flex flex-col gap-y-3">
                  {cart.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm">
                      <div className="flex gap-x-2 items-center">
                        <span className="font-semibold">{item.quantity}x</span>
                        <span className="text-ui-fg-subtle line-clamp-1">{item.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Text className="txt-medium text-ui-fg-subtle mb-1 mt-4">
                By placing your order, you agree to our terms of service and privacy policy.
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
