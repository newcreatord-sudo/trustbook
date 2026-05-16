export function newRequestId(): string {
  try {
    const cryptoObj = globalThis.crypto as Crypto | undefined
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  } catch {}

  try {
    const cryptoObj = globalThis.crypto as Crypto | undefined
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16)
      cryptoObj.getRandomValues(bytes)
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      return `rid_${hex}`
    }
  } catch {}

  return `rid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
