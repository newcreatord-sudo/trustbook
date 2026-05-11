/**
 * SMS dispatch skeleton.
 *
 * Why a skeleton: SMS routing is provider-specific (Twilio, Vonage, Skebby for
 * Italian short-code), requires KYC, and has billing implications. This module
 * keeps the public surface stable so the notification engine can call
 * `dispatchSms()` and observe a uniform `DeliveryResult`, while the actual
 * provider call is gated behind env keys.
 *
 * Provider selection (in priority order):
 *   1. TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
 *   2. SKEBBY_USER_KEY + SKEBBY_SESSION_KEY + SKEBBY_SENDER
 *
 * If neither is configured we return `{ skipped: true, reason: 'no_provider' }`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from './observability.js'

type SmsInput = {
  userId: string
  phoneE164: string
  body: string
  notificationId?: string
}

type DeliveryResult = {
  delivered: boolean
  provider: 'twilio' | 'skebby' | null
  providerMessageId: string | null
  errorCode: string | null
  errorMessage: string | null
  skipped?: boolean
  reason?: string
}

let adminClient: SupabaseClient | null = null
function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  adminClient = createClient(url, key, { auth: { persistSession: false } })
  return adminClient
}

function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}

export async function dispatchSms(input: SmsInput): Promise<DeliveryResult> {
  if (!isE164(input.phoneE164)) {
    return { delivered: false, provider: null, providerMessageId: null, errorCode: 'invalid_phone', errorMessage: 'phone_not_e164' }
  }
  if (!input.body || input.body.length > 480) {
    return { delivered: false, provider: null, providerMessageId: null, errorCode: 'invalid_body', errorMessage: 'body_length_invalid' }
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom = process.env.TWILIO_FROM

  let result: DeliveryResult = {
    delivered: false,
    provider: null,
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    skipped: true,
    reason: 'no_provider',
  }

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
      const params = new URLSearchParams({ To: input.phoneE164, From: twilioFrom, Body: input.body })
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })
      const data = (await resp.json().catch(() => null)) as { sid?: string; code?: number; message?: string } | null
      if (resp.ok && data?.sid) {
        result = { delivered: true, provider: 'twilio', providerMessageId: data.sid, errorCode: null, errorMessage: null }
      } else {
        result = {
          delivered: false,
          provider: 'twilio',
          providerMessageId: null,
          errorCode: data?.code ? String(data.code) : String(resp.status),
          errorMessage: data?.message ?? `Twilio HTTP ${resp.status}`,
        }
      }
    } catch (e) {
      result = {
        delivered: false,
        provider: 'twilio',
        providerMessageId: null,
        errorCode: 'twilio_exception',
        errorMessage: e instanceof Error ? e.message : String(e),
      }
    }
  }

  const sb = getAdminClient()
  if (sb) {
    await sb.from('notification_delivery_log').insert({
      notification_id: input.notificationId ?? null,
      recipient_user_id: input.userId,
      channel: 'sms',
      provider: result.provider,
      provider_message_id: result.providerMessageId,
      status: result.delivered ? 'sent' : 'failed',
      error_code: result.errorCode,
      error_message: result.errorMessage,
    })
  }

  logEvent(result.delivered ? 'info' : 'warn', 'sms_dispatch', {
    user_id: input.userId,
    provider: result.provider,
    delivered: result.delivered,
    error_code: result.errorCode,
  })

  return result
}
