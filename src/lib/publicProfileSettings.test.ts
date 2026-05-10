import { describe, expect, it } from 'vitest'
import { resolvePublicProfileSettings, DEFAULT_PUBLIC_PROFILE_SETTINGS } from '@/lib/publicProfileSettings'

describe('resolvePublicProfileSettings', () => {
  it('defaults all true when empty', () => {
    expect(resolvePublicProfileSettings({})).toEqual(DEFAULT_PUBLIC_PROFILE_SETTINGS)
    expect(resolvePublicProfileSettings(null)).toEqual(DEFAULT_PUBLIC_PROFILE_SETTINGS)
  })

  it('respects explicit false', () => {
    expect(
      resolvePublicProfileSettings({
        show_gallery: false,
        show_reviews: false,
      }),
    ).toMatchObject({
      show_gallery: false,
      show_reviews: false,
      show_description: true,
    })
  })
})
