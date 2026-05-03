import { describe, expect, it } from 'vitest'
import { redactEvidenceLinesForUi, redactTechnicalIdsInEvidenceLine } from '@/lib/aiEvidenceDisplay'

describe('aiEvidenceDisplay', () => {
  it('redacts UUID-looking tokens', () => {
    expect(
      redactTechnicalIdsInEvidenceLine(
        'Cliente: aaaaaaaa-bbbb-5ccc-dddd-eeeeeeeeeeee · altro',
      ),
    ).toBe('Cliente: [riferimento interno] · altro')
  })

  it('maps arrays', () => {
    expect(
      redactEvidenceLinesForUi([
        'Booking: 11111111-2222-5333-8444-555555555555',
        'No-show nel periodo: 2',
      ]),
    ).toEqual(['Booking: [riferimento interno]', 'No-show nel periodo: 2'])
  })
})
