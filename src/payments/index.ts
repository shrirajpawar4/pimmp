import type { PaymentMethodId } from '../types.js'
import type { PaymentMethodAdapter } from './types.js'
import { tempoUsdAdapter } from './tempo-usd.js'
import { usdcBaseAdapter } from './usdc-base.js'

const PAYMENT_METHOD_ADAPTERS: Record<PaymentMethodId, PaymentMethodAdapter> = {
  'tempo-usd': tempoUsdAdapter,
  'usdc-base': usdcBaseAdapter,
}

export function getPaymentAdapter(method: PaymentMethodId): PaymentMethodAdapter {
  return PAYMENT_METHOD_ADAPTERS[method]
}

export { tempoUsdAdapter } from './tempo-usd.js'
export { usdcBaseAdapter } from './usdc-base.js'
export type { PaymentMethodAdapter, VerifyTransferResult } from './types.js'
