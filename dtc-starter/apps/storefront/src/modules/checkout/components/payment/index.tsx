"use client"
import { RadioGroup } from "@headlessui/react"
import { isStripeLike, paymentInfoMap } from "@lib/constants"
import { initiatePaymentSession, updateCart } from "@lib/data/cart"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer, {
  StripePaymentContainer,
} from "@modules/checkout/components/payment-container"
import Divider from "@modules/common/components/divider"
import {
  Button,
  Container,
  Heading,
  Text,
  clx,
} from "@modules/common/components/ui"
import { HttpTypes } from "@medusajs/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

const Payment = ({
  cart,
  availablePaymentMethods,
  qrPayment = false,
}: {
  cart: HttpTypes.StoreCart
  qrPayment?: boolean
  availablePaymentMethods: { id: string }[]
}) => {
  const displayedPaymentInfo = qrPayment
    ? {
        ...paymentInfoMap,
        manual_bank: { ...paymentInfoMap.manual_bank, title: "QR payment" },
      }
    : paymentInfoMap
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentComplete, setPaymentComplete] = useState(false)
  // Fallback to metadata if available, otherwise activeSession
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState("manual_bank")

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  const actualProviderId = (methodId: string) => {
    if (methodId === "manual_bank") return "pp_system_default"
    return methodId
  }

  const setPaymentMethod = async (method: string) => {
    setError(null)
    setSelectedPaymentMethod(method)
    if (isStripeLike(method)) {
      await initiatePaymentSession(cart, {
        provider_id: actualProviderId(method),
      })
    }
  }

  const virtualPaymentMethods = useMemo(
    () =>
      availablePaymentMethods.some(
        (method) => method.id === "pp_system_default"
      )
        ? [{ id: "manual_bank" }]
        : [],
    [availablePaymentMethods]
  )

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])
      ?.length > 0 &&
    cart?.total === 0
  )

  const paymentReady =
    (activeSession && (cart?.shipping_methods?.length ?? 0) !== 0) ||
    paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  const hasShipping = (cart.shipping_methods?.length ?? 0) > 0

  const handleSubmit = async () => {
    if (!hasShipping) {
      setError("Unable to calculate shipping. Please check your address.")
      return
    }
    setIsLoading(true)
    try {
      const shouldInputPaymentDetails =
        isStripeLike(selectedPaymentMethod) && !activeSession

      const checkActiveSession =
        activeSession?.provider_id === actualProviderId(selectedPaymentMethod)

      if (!checkActiveSession) {
        await initiatePaymentSession(cart, {
          provider_id: actualProviderId(selectedPaymentMethod),
        })
      }

      // Every new order requires bank transfer.
      if (selectedPaymentMethod === "manual_bank") {
        await updateCart({
          metadata: { payment_method: selectedPaymentMethod },
        })
      }

      if (!shouldInputPaymentDetails) {
        return router.push(
          pathname + "?" + createQueryString("step", "review"),
          {
            scroll: false,
          }
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && !paymentReady,
            }
          )}
        >
          Payment
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={handleEdit}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              data-testid="edit-payment-button"
            >
              Edit
            </button>
          </Text>
        )}
      </div>
      <div>
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard && availablePaymentMethods?.length && (
            <>
              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(value: string) => setPaymentMethod(value)}
              >
                {virtualPaymentMethods.map((paymentMethod) => (
                  <div key={paymentMethod.id}>
                    {isStripeLike(paymentMethod.id) ? (
                      <StripePaymentContainer
                        paymentProviderId={paymentMethod.id}
                        selectedPaymentOptionId={selectedPaymentMethod}
                        paymentInfoMap={displayedPaymentInfo}
                        setError={setError}
                        setPaymentComplete={setPaymentComplete}
                      />
                    ) : (
                      <div className="flex flex-col">
                        <PaymentContainer
                          paymentInfoMap={displayedPaymentInfo}
                          paymentProviderId={paymentMethod.id}
                          selectedPaymentOptionId={selectedPaymentMethod}
                        />
                        {paymentMethod.id === "manual_bank" &&
                          selectedPaymentMethod === "manual_bank" && (
                            <div className="mt-4 p-4 bg-amber-50 rounded-md border border-amber-200">
                              <Text className="txt-medium">
                                {qrPayment ? (
                                  "After placing your order, scan the payment QR with your phone camera and open the link. Payment is confirmed automatically. You have 10 minutes to complete payment."
                                ) : (
                                  <>
                                    After placing your order, the code{" "}
                                    <strong>VietQR</strong> will appear. The
                                    system will{" "}
                                    <strong>automatically confirm</strong> once
                                    payment is received. You have{" "}
                                    <strong>10 minutes</strong> to transfer
                                    payment before the order is automatically
                                    canceled.
                                  </>
                                )}
                              </Text>
                              <Text className="txt-medium mt-2 text-ui-fg-subtle">
                                The transfer amount includes items and shipping.
                              </Text>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </RadioGroup>
              {
                <Text className="txt-small mt-2 text-ui-fg-subtle">
                  {qrPayment
                    ? "Complete payment by scanning your order QR."
                    : "All orders require bank transfer."}
                </Text>
              }
            </>
          )}

          {paidByGiftcard && (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          )}

          {!hasShipping && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900"
            >
              <p>
                Unable to calculate shipping. Check your address before
                continuing.
              </p>
              <button
                type="button"
                className="mt-2 min-h-11 underline"
                onClick={() =>
                  router.push(pathname + "?step=address", { scroll: false })
                }
              >
                Check address and recalculate shipping
              </button>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="payment-method-error-message"
          />

          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              !hasShipping ||
              (isStripeLike(selectedPaymentMethod) && !paymentComplete) ||
              (!selectedPaymentMethod && !paidByGiftcard)
            }
            data-testid="submit-payment-button"
          >
            {!activeSession && isStripeLike(selectedPaymentMethod)
              ? "Enter payment details"
              : "Continue to review"}
          </Button>
        </div>

        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="flex items-start gap-x-1 w-full">
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment method
                </Text>
                <Text
                  className="txt-medium text-ui-fg-subtle"
                  data-testid="payment-method-summary"
                >
                  {paymentInfoMap[selectedPaymentMethod]?.title ||
                    paymentInfoMap[activeSession?.provider_id]?.title ||
                    activeSession?.provider_id}
                </Text>
              </div>
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment details
                </Text>
                <div
                  className="flex gap-2 txt-medium text-ui-fg-subtle items-center"
                  data-testid="payment-details-summary"
                >
                  <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                    {paymentInfoMap[selectedPaymentMethod]?.icon || (
                      <CreditCard />
                    )}
                  </Container>
                  <Text>Another step will appear</Text>
                </div>
              </div>
            </div>
          ) : paidByGiftcard ? (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          ) : null}
        </div>
      </div>
      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
