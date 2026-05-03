import { afterEach, describe, expect, test, vi } from 'vitest'
import { formatDateTime, formatMoneyEUR, addMinutes, startOfDay, nowIso } from './time'

describe('Time and Money Utilities', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('nowIso ritorna una stringa ISO valida', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T10:11:12.345Z'))
    const iso = nowIso()
    expect(iso).toBe('2026-04-29T10:11:12.345Z')
    expect(Number.isNaN(Date.parse(iso))).toBe(false)
  })

  test('formatDateTime formatta correttamente', () => {
    // Impostiamo una data fissa (1 Gennaio 2024, 15:30 UTC)
    const date = new Date(Date.UTC(2024, 0, 1, 15, 30))
    // A causa dei fusi orari locali, formatDateTime userà il fuso locale del sistema.
    // Verifichiamo almeno che contenga il formato base aspettato
    const formatted = formatDateTime(date.toISOString())
    expect(formatted).toContain('·')
    expect(typeof formatted).toBe('string')
    expect(formatted.length).toBeGreaterThan(10)
  })

  test('formatMoneyEUR formatta correttamente i centesimi in Euro', () => {
    expect(formatMoneyEUR(0).replace(/\s/g, ' ')).toBe('0,00 €')
    expect(formatMoneyEUR(1500).replace(/\s/g, ' ')).toBe('15,00 €')
    expect(formatMoneyEUR(10050).replace(/\s/g, ' ')).toBe('100,50 €')
    // Verifica che converta l'importo ma non forziamo il separatore migliaia (dipende dall'ambiente)
    const thousands = formatMoneyEUR(123456).replace(/\s/g, ' ')
    expect(thousands.includes('1234,56') || thousands.includes('1.234,56')).toBe(true)
  })

  test('addMinutes aggiunge correttamente minuti', () => {
    const base = new Date('2024-01-01T10:00:00.000Z')
    const added = addMinutes(base, 45)
    expect(added.toISOString()).toBe('2024-01-01T10:45:00.000Z')

    const subtracted = addMinutes(base, -30)
    expect(subtracted.toISOString()).toBe('2024-01-01T09:30:00.000Z')
  })

  test('startOfDay azzera correttamente l orario alla mezzanotte locale', () => {
    const base = new Date('2024-01-01T15:45:30.123Z')
    const sod = startOfDay(base)
    // sod dovrebbe avere ore/min/sec/ms a zero nel fuso orario locale
    expect(sod.getHours()).toBe(0)
    expect(sod.getMinutes()).toBe(0)
    expect(sod.getSeconds()).toBe(0)
    expect(sod.getMilliseconds()).toBe(0)
  })
})