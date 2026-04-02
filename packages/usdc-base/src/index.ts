export {
  amountDecimal,
  buildTransferData,
  didFromAddress,
  receiptMatchesTransfer,
  USDC_BASE_ADDRESS,
  USDC_BASE_CHAIN_ID,
  USDC_DECIMALS,
  usdcBaseCredentialPayloadSchema,
  usdcBaseMethod,
  usdcBaseMethodName,
  usdcBaseRequestSchema,
} from './shared.js'
export type {
  UsdcBaseCredentialPayload,
  UsdcBaseRequest,
  VerifyTransferFn,
  VerifyTransferResult,
} from './shared.js'
export { usdcBase, verifyTransferWithRpc } from './server.js'
export type { UsdcBaseServerOptions } from './server.js'
export { createPaymentWithKey, usdcBaseClient } from './client.js'
export type { CreatePaymentFn, UsdcBaseClientOptions } from './client.js'
