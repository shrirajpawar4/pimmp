export type EncryptedValue = {
  ciphertext: string
  iv: string
}

export type PaymentMethodId = 'tempo-usd' | 'usdc-base'

export type PaymentCharge = {
  amount: string
  currency: string
  recipient: string
  description?: string
  methodDetails: Record<string, unknown>
}

export type UsdcBasePaymentConfig = {
  method: 'usdc-base'
  recipient: string
  currency: 'usdc'
  network: 'base'
  chainId: 8453
  token: string
}

export type TempoUsdPaymentConfig = {
  method: 'tempo-usd'
  recipient: string
  currency: 'usd'
  network: 'tempo'
  chainId: 4217 | 42431
  token: string
}

export type EndpointPaymentConfig = TempoUsdPaymentConfig | UsdcBasePaymentConfig

export type RegisterEndpointPaymentInput =
  | {
      method: 'usdc-base'
      recipient: string
      chainId?: 8453
      network?: 'base'
      token?: string
    }
  | {
      method: 'tempo-usd'
      recipient: string
      chainId?: 4217 | 42431
      network?: 'tempo'
      token: string
    }

export type StoredEndpoint = {
  createdAt: number
  id: string
  originUrl: string
  payment: EndpointPaymentConfig
  priceAtomic?: string
  routePricesAtomic?: Record<string, string>
  callCount: number
  upstreamHeaders?: Record<string, EncryptedValue>
  upstreamQuery?: Record<string, EncryptedValue>
}

export type LegacyStoredEndpoint = {
  createdAt: number
  destinationWallet: string
  id: string
  originUrl: string
  priceAtomic?: string
  routePricesAtomic?: Record<string, string>
  callCount: number
  upstreamHeaders?: Record<string, EncryptedValue>
  upstreamQuery?: Record<string, EncryptedValue>
}

export type PimpEndpoint = {
  createdAt: number
  id: string
  originUrl: string
  payment: EndpointPaymentConfig
  priceAtomic?: string
  routePricesAtomic?: Record<string, string>
  callCount: number
  upstreamHeaders: Record<string, string>
  upstreamQuery: Record<string, string>
}

export type RegisterEndpointInput = {
  authHeader?: {
    name: string
    value: string
  }
  baseUrl?: string
  destinationWallet?: string
  originUrl?: string
  payment?: RegisterEndpointPaymentInput
  priceUsdc?: string
  routePricesUsdc?: Record<string, string>
  upstreamHeaders?: Record<string, string>
  upstreamQuery?: Record<string, string>
}

export type RegisterEndpointResult = {
  id: string
  proxiedBaseUrl: string
  proxiedRoutes: Record<string, string>
  proxiedUrl: string
}

export type MatchedRoute = {
  path: string
  priceAtomic: string
}

export type ChallengeState = {
  endpointId: string
  expiresAt: number
  routePath: string
  paymentMethod: PaymentMethodId
  chargeRequest: PaymentCharge
}

export type LegacyChallengeState = {
  endpointId: string
  expectedAmount: string
  expectedRecipient: string
  expiresAt: number
  routePath: string
}

export interface MppService {
  id: string
  name: string
  serviceUrl: string
  description: string
  categories: string[]
}

export type Bindings = {
  BASE_RPC_URL: string
  ENDPOINTS: KVNamespace
  GATEWAY_CACHE: KVNamespace
  PIMP_DATA_KEY: string
  PIMP_DESTINATION_WALLET: string
  PIMP_SECRET: string
  TEMPO_CHAIN_ID?: string
  TEMPO_RPC_URL?: string
  UPSTASH_REDIS_REST_TOKEN: string
  UPSTASH_REDIS_REST_URL: string
}
