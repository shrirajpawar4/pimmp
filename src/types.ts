export type EncryptedValue = {
  ciphertext: string
  iv: string
}

export type StoredEndpoint = {
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
  destinationWallet: string
  id: string
  originUrl: string
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
  expectedAmount: string
  expectedRecipient: string
  expiresAt: number
  routePath: string
}

export type Bindings = {
  BASE_RPC_URL: string
  ENDPOINTS: KVNamespace
  PIMP_DATA_KEY: string
  PIMP_DESTINATION_WALLET: string
  PIMP_SECRET: string
  UPSTASH_REDIS_REST_TOKEN: string
  UPSTASH_REDIS_REST_URL: string
}
