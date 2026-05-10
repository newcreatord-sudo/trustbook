export function coerceRpcJsonbArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const v = data as { values?: unknown }
    if (Array.isArray(v.values)) return v.values as T[]
  }
  return []
}

export function primaryRpcErrorMessage(err: unknown): string {
  if (typeof err === 'string') {
    const t = err.trim()
    return t.split('\n')[0]?.trim() ?? t
  }
  if (err instanceof Error) {
    const t = err.message.trim()
    return t.split('\n')[0]?.trim() ?? t
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string') {
      const first = m.split('\n')[0]?.trim() ?? m.trim()
      return first
    }
  }
  return ''
}
