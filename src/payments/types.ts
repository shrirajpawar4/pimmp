import type { Bindings, MatchedRoute, PaymentCharge, PimpEndpoint, PaymentMethodId } from '../types.js'

export type VerifyTransferResult = {
  error?: string
  valid: boolean
}

export type CreateServerMethodVerifyFn = (parameters: {
  challengeId: string
  request: PaymentCharge
  txid: string
}) => Promise<{ txid: string; valid: boolean }>

export type PaymentMethodAdapter = {
  method: PaymentMethodId
  createServerMethod(env: Bindings, verifyTransfer: CreateServerMethodVerifyFn): unknown
  buildChargeRequest(endpoint: PimpEndpoint, matchedRoute: MatchedRoute): PaymentCharge
  serializeChargeRequest(request: PaymentCharge): PaymentCharge
  matchesStoredChargeRequest(stored: PaymentCharge, request: PaymentCharge): boolean
  verifyTransfer(parameters: {
    challengeId: string
    env: Bindings
    request: PaymentCharge
    txid: string
  }): Promise<VerifyTransferResult>
}
