import { describe, expect, test } from 'vitest'
import { defaultUserPreferences, notificationCategory, shouldShowNotification } from '@/lib/userPreferences'

describe('userPreferences notifications', () => {
  test('categorizes reminder kinds', () => {
    expect(notificationCategory('reminder_24h')).toBe('reminders')
    expect(notificationCategory('booking_reminder_2h')).toBe('reminders')
  })

  test('categorizes owner alerts kinds', () => {
    expect(notificationCategory('owner_risky_customer_warning')).toBe('owner_alerts')
    expect(notificationCategory('risky_customer_warning')).toBe('owner_alerts')
  })

  test('shouldShowNotification respects reminders toggle', () => {
    const prefs = { ...defaultUserPreferences, channelInApp: true, notifReminders: false }
    expect(shouldShowNotification('reminder_24h', prefs)).toBe(false)
    expect(shouldShowNotification('booking_confirmed', prefs)).toBe(true)
  })

  test('shouldShowNotification respects owner alerts toggle', () => {
    const prefs = { ...defaultUserPreferences, channelInApp: true, notifOwnerAlerts: false }
    expect(shouldShowNotification('owner_risky_customer_warning', prefs)).toBe(false)
    expect(shouldShowNotification('booking_requested', prefs)).toBe(true)
  })
})

