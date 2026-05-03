import type { KnownNotificationKind, LocationSharing, ProfileVisibility, UserPreferencesRow } from '@/domain/supabase'

export type UserPreferences = {
  profileVisibility: ProfileVisibility
  locationSharing: LocationSharing
  notifBooking: boolean
  notifDeposit: boolean
  notifMessages: boolean
  notifMarketing: boolean
  notifReminders: boolean
  notifOwnerAlerts: boolean
  channelInApp: boolean
  channelEmail: boolean
  channelPush: boolean
  channelSms: boolean
  voiceCommandsEnabled: boolean
}

export const defaultUserPreferences: UserPreferences = {
  profileVisibility: 'private',
  locationSharing: 'off',
  notifBooking: true,
  notifDeposit: true,
  notifMessages: true,
  notifMarketing: false,
  notifReminders: true,
  notifOwnerAlerts: true,
  channelInApp: true,
  channelEmail: true,
  channelPush: false,
  channelSms: false,
  voiceCommandsEnabled: false,
}

export function prefsFromRow(row: UserPreferencesRow | null): UserPreferences {
  if (!row) return { ...defaultUserPreferences }
  return {
    profileVisibility: row.profile_visibility,
    locationSharing: row.location_sharing,
    notifBooking: row.notif_booking,
    notifDeposit: row.notif_deposit,
    notifMessages: row.notif_messages,
    notifMarketing: row.notif_marketing,
    notifReminders: row.notif_reminders,
    notifOwnerAlerts: row.notif_owner_alerts,
    channelInApp: row.channel_in_app,
    channelEmail: row.channel_email,
    channelPush: row.channel_push,
    channelSms: row.channel_sms,
    voiceCommandsEnabled: row.voice_commands_enabled,
  }
}

export function prefsToUpsertRow(userId: string, prefs: UserPreferences): Partial<UserPreferencesRow> {
  return {
    user_id: userId,
    profile_visibility: prefs.profileVisibility,
    location_sharing: prefs.locationSharing,
    notif_booking: prefs.notifBooking,
    notif_deposit: prefs.notifDeposit,
    notif_messages: prefs.notifMessages,
    notif_marketing: prefs.notifMarketing,
    notif_reminders: prefs.notifReminders,
    notif_owner_alerts: prefs.notifOwnerAlerts,
    channel_in_app: prefs.channelInApp,
    channel_email: prefs.channelEmail,
    channel_push: prefs.channelPush,
    channel_sms: prefs.channelSms,
    voice_commands_enabled: prefs.voiceCommandsEnabled,
  }
}

export type NotificationCategory = 'booking' | 'deposit' | 'messages' | 'marketing' | 'reminders' | 'owner_alerts' | 'other'

export function notificationCategory(kind: string): NotificationCategory {
  const k = String(kind)
  if (k.includes('reminder')) return 'reminders'
  if (k.includes('risky') || k.includes('owner_')) return 'owner_alerts'
  if (k.includes('deposit')) return 'deposit'
  if (k.includes('message') || k.includes('chat')) return 'messages'
  if (k.includes('marketing') || k.includes('promo')) return 'marketing'
  return 'booking'
}

export function shouldShowNotification(kind: KnownNotificationKind | string, prefs: UserPreferences): boolean {
  const cat = notificationCategory(kind)
  if (!prefs.channelInApp) return true
  if (cat === 'booking') return prefs.notifBooking
  if (cat === 'deposit') return prefs.notifDeposit
  if (cat === 'messages') return prefs.notifMessages
  if (cat === 'marketing') return prefs.notifMarketing
  if (cat === 'reminders') return prefs.notifReminders
  if (cat === 'owner_alerts') return prefs.notifOwnerAlerts
  return true
}
