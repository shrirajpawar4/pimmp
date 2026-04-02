import { Mppx } from 'mppx/server'

import { usdcBase } from '@pimpp/usdc-base'

import { validateAndConsumePayment } from './payment.js'
import type { Bindings, PimpEndpoint } from './types.js'

export function createPaymentHandler(env: Bindings, endpoint: PimpEndpoint, realm: string) {
  return Mppx.create({
    methods: [
      usdcBase({
        rpcUrl: env.BASE_RPC_URL,
        verifyTransfer: async ({ challengeId, txid }) => {
          const result = await validateAndConsumePayment({
            challengeId,
            endpoint,
            env,
            txid,
          })
          return {
            txid,
            valid: result.valid,
          }
        },
      }),
    ],
    realm,
    secretKey: env.PIMP_SECRET,
  })
}
