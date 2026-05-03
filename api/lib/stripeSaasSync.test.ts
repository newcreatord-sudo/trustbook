import { describe, expect, it } from 'vitest'
import { mapStripeSubscriptionToTrustBookStatus } from './stripeSaasSync.js'

describe('stripeSaasSync', () => {
  it('maps Stripe subscription statuses into TrustBook rows', () => {
    expect(mapStripeSubscriptionToTrustBookStatus('active')).toBe('active')
    expect(mapStripeSubscriptionToTrustBookStatus('trialing')).toBe('trialing')
    expect(mapStripeSubscriptionToTrustBookStatus('past_due')).toBe('past_due')
    expect(mapStripeSubscriptionToTrustBookStatus('canceled')).toBe('canceled')
    expect(mapStripeSubscriptionToTrustBookStatus('unpaid')).toBe('past_due')
    expect(mapStripeSubscriptionToTrustBookStatus('incomplete')).toBe('trialing')
    expect(mapStripeSubscriptionToTrustBookStatus('incomplete_expired')).toBe('canceled')
    expect(mapStripeSubscriptionToTrustBookStatus('paused')).toBe('active')
  })
})
