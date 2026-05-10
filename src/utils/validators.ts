import { sanitizePublicHttpUrl } from '@/lib/publicImageUrl'

export function isEmailLike(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function isHttpUrl(input: string): boolean {
  return sanitizePublicHttpUrl(input) !== null
}

export function isPhoneLike(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  const digits = s.replace(/\D/g, '')
  return digits.length >= 8
}

