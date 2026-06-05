import { Mppx } from 'mppx/server'

import { getPaymentAdapter } from './payments/index.js'
import { validateAndConsumePayment } from './payment.js'
import type { Bindings, PimpEndpoint } from './types.js'

export function createPaymentHandler(env: Bindings, endpoint: PimpEndpoint, realm: string) {
  const adapter = getPaymentAdapter(endpoint.payment.method)
  return Mppx.create({
    methods: [
      adapter.createServerMethod(env, async ({ challengeId, txid }) => {
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
        }),
    ],
    realm,
    secretKey: env.PIMP_SECRET,
  })
}
