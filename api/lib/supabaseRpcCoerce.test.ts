import { describe, expect, it } from 'vitest'
import { coerceRpcJsonbArray, primaryRpcErrorMessage } from './supabaseRpcCoerce.js'

describe('coerceRpcJsonbArray', () => {
  it('passes through arrays', () => {
    expect(coerceRpcJsonbArray([{ a: 1 }])).toEqual([{ a: 1 }])
  })

  it('parses JSON array strings', () => {
    expect(coerceRpcJsonbArray('[{"id":"x"}]')).toEqual([{ id: 'x' }])
  })

  it('returns [] on invalid JSON string', () => {
    expect(coerceRpcJsonbArray('not json')).toEqual([])
  })

  it('returns [] for non-array JSON', () => {
    expect(coerceRpcJsonbArray('{}')).toEqual([])
  })

  it('reads legacy { values: [] } wrapper if present', () => {
    expect(coerceRpcJsonbArray({ values: [1, 2] })).toEqual([1, 2])
  })
})

describe('primaryRpcErrorMessage', () => {
  it('takes first line of multiline message', () => {
    expect(primaryRpcErrorMessage({ message: 'member_only\ndetail' })).toBe('member_only')
  })

  it('handles Error', () => {
    expect(primaryRpcErrorMessage(new Error('not_authenticated'))).toBe('not_authenticated')
  })

  it('handles multiline Error', () => {
    expect(primaryRpcErrorMessage(new Error('member_only\nCONTEXT: ...'))).toBe('member_only')
  })

  it('handles string errors', () => {
    expect(primaryRpcErrorMessage('ai_booking_operator_disabled')).toBe('ai_booking_operator_disabled')
  })
})
