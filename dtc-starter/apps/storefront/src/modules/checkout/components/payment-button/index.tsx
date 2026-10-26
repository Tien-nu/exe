"use client"

import { isManual } from "@lib/constants"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import React, { useState } from "react"
import ErrorMessage from "../error-message"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const notReady = !cart || !cart.shipping_address

  const paymentSession = cart.payment_collection?.payment_sessions?.[0]
  const metadataProvider = cart.metadata?.payment_method as string

  if (
    metadataProvider === "manual_bank" &&
    isManual(paymentSession?.provider_id)
  )
    return (
      <BankTransferPaymentButton notReady={notReady} data-testid={dataTestId} />
    )
  return <Button disabled>Select bank transfer to continue</Button>
}

const BankTransferPaymentButton = ({ notReady }: { notReady: boolean }) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .then((errorMessage) => {
        if (typeof errorMessage === "string") {
          setErrorMessage(errorMessage)
        }
      })
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const handlePayment = () => {
    setSubmitting(true)

    onPaymentCompleted()
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

export default PaymentButton
