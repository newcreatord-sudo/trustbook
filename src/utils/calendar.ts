import { startOfDay } from '@/utils/time'

export { startOfDay }

export function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

export function formatDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateInput(value: string): Date | null {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(value.trim())
  if (!m) return null
  const d = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return null
  return d
}

export function getWeekRange(anchor: Date, weekStartsOnMonday = true): { start: Date; end: Date } {
  const d = startOfDay(anchor)
  const dow = d.getDay()
  const mondayBased = (dow + 6) % 7
  const offset = weekStartsOnMonday ? -mondayBased : -dow
  const start = addDays(d, offset)
  const end = addDays(start, 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
