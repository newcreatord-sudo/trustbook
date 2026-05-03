export function readEnv(name: string): string | null {
  const v = process.env[name]
  if (!v) return null
  const trimmed = v.trim()
  if (!trimmed) return null
  const strip = (s: string) => {
    const t = s.trim()
    const pairs: Array<[string, string]> = [
      ['"', '"'],
      ["'", "'"],
      ['`', '`'],
    ]
    for (const [l, r] of pairs) {
      if (t.startsWith(l) && t.endsWith(r) && t.length >= 2) return t.slice(1, -1)
    }
    return t
  }
  return strip(trimmed)
}

export function readEnvAny(names: string[]): string | null {
  for (const n of names) {
    const v = readEnv(n)
    if (v) return v
  }
  return null
}
