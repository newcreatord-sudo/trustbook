import { describe, expect, it } from 'vitest'
import { notificationEmailCategoryAllowed } from './notifications.js'

describe('notificationEmailCategoryAllowed', () => {
  const allOn = {
    channel_email: true as boolean | null,
    notif_booking: true,
    notif_deposit: true,
    notif_messages: true,
    notif_marketing: true,
    notif_reminders: true,
    notif_owner_alerts: true,
  }

  it('allows everything when prefs row missing', () => {
    expect(notificationEmailCategoryAllowed('reminder_24h', null)).toBe(true)
    expect(notificationEmailCategoryAllowed('booking_confirmed', null)).toBe(true)
  })

  it('blocks reminders when notif_reminders is false', () => {
    expect(notificationEmailCategoryAllowed('reminder_24h', { ...allOn, notif_reminders: false })).toBe(false)
    expect(notificationEmailCategoryAllowed('reminder_2h', { ...allOn, notif_reminders: false })).toBe(false)
  })

  it('blocks booking bucket when notif_booking is false', () => {
    expect(notificationEmailCategoryAllowed('booking_confirmed', { ...allOn, notif_booking: false })).toBe(false)
    expect(notificationEmailCategoryAllowed('time_change', { ...allOn, notif_booking: false })).toBe(false)
  })

  it('allows booking when reminders off but kind is not reminder', () => {
    expect(notificationEmailCategoryAllowed('booking_confirmed', { ...allOn, notif_reminders: false })).toBe(true)
  })
})
