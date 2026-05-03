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
  return Boolean(env('SMTP_HOST') && env('SMTP_PORT') && env('SMTP_FROM'))
}

export async function sendEmail(params: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<void> {
  const host = env('SMTP_HOST')
  const portRaw = env('SMTP_PORT')
  const from = env('SMTP_FROM')
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
  })
}

