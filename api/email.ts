import nodemailer from 'nodemailer'

function env(name: string): string | null {
  const v = process.env[name]
  if (!v) return null
  const trimmed = v.trim()
  if (!trimmed) return null
  const strip = (s: string) => {
    const t = s.trim()
    const pairs: Array<[string, string]> = [
      ['"', '"'],
      ["'", "'"],
      ['`', '`'],
    ]
    for (const [l, r] of pairs) {
      if (t.startsWith(l) && t.endsWith(r) && t.length >= 2) return t.slice(1, -1)
    }
    return t
  }
  return strip(trimmed)
}

export function canSendEmail(): boolean {
  return emailConfigStatus().canSend
}

export type EmailConfigStatus = {
  provider: 'smtp' | 'resend'
  hasFrom: boolean
  hasResendApiKey: boolean
  hasSmtpHost: boolean
  hasSmtpPort: boolean
  canSend: boolean
}

export function emailConfigStatus(): EmailConfigStatus {
  const providerRaw = (env('EMAIL_PROVIDER') ?? 'smtp').toLowerCase()
  const provider: 'smtp' | 'resend' = providerRaw === 'resend' ? 'resend' : 'smtp'
  const from = env('EMAIL_FROM') ?? env('SMTP_FROM')
  const hasFrom = Boolean(from)
  const hasResendApiKey = Boolean(env('RESEND_API_KEY'))
  const hasSmtpHost = Boolean(env('SMTP_HOST'))
  const hasSmtpPort = Boolean(env('SMTP_PORT'))
  const canSend =
    provider === 'resend' ? Boolean(hasFrom && hasResendApiKey) : Boolean(hasFrom && hasSmtpHost && hasSmtpPort)
  return { provider, hasFrom, hasResendApiKey, hasSmtpHost, hasSmtpPort, canSend }
}

export async function sendEmail(params: {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
  headers?: Record<string, string>
}): Promise<void> {
  const provider = (env('EMAIL_PROVIDER') ?? 'smtp').toLowerCase()
  const from = env('EMAIL_FROM') ?? env('SMTP_FROM')
  if (provider === 'resend') {
    const apiKey = env('RESEND_API_KEY')
    if (!apiKey || !from) throw new Error('Resend is not configured')
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        reply_to: params.replyTo,
        headers: params.headers,
      }),
    })
    if (!r.ok) {
      const msg = await r.text().catch(() => '')
      throw new Error(msg ? `Resend error: ${msg}` : 'Resend error')
    }
    return
  }

  const host = env('SMTP_HOST')
  const portRaw = env('SMTP_PORT')
  if (!host || !portRaw || !from) throw new Error('SMTP is not configured')

  const port = Number(portRaw)
  if (!Number.isFinite(port) || port <= 0) throw new Error('Invalid SMTP_PORT')

  const user = env('SMTP_USER')
  const pass = env('SMTP_PASS')
  const secure = (env('SMTP_SECURE') ?? '').toLowerCase() === 'true'

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  })

  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    replyTo: params.replyTo,
    headers: params.headers,
  })
}
