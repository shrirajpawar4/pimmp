export type EncryptedValue = {
  ciphertext: string
  iv: string
}

export type StoredEndpoint = {
  createdAt: number
  destinationWallet: string
  id: string
  originUrl: string
  priceAtomic: string
  callCount: number
  upstreamHeaders?: Record<string, EncryptedValue>
  upstreamQuery?: Record<string, EncryptedValue>
}

export type PimpEndpoint = {
  createdAt: number
  destinationWallet: string
  id: string
  originUrl: string
  priceAtomic: string
  callCount: number
  upstreamHeaders: Record<string, string>
  upstreamQuery: Record<string, string>
}

export type RegisterEndpointInput = {
  destinationWallet: string
  originUrl: string
  priceUsdc: string
  upstreamHeaders?: Record<string, string>
  upstreamQuery?: Record<string, string>
}

export type ChallengeState = {
  endpointId: string
  expectedAmount: string
  expectedRecipient: string
  expiresAt: number
}

export type Bindings = {
  BASE_RPC_URL: string
  ENDPOINTS: KVNamespace
  PIMP_DATA_KEY: string
  PIMP_SECRET: string
  UPSTASH_REDIS_REST_TOKEN: string
  UPSTASH_REDIS_REST_URL: string
}
