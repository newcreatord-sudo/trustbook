/** Evidenze suggerimenti: nasconde UUID e altri identificativi tecnici in superficie (riduce leakage da screenshot/log). */

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

export function redactTechnicalIdsInEvidenceLine(line: string): string {
  return line.replace(UUID_RE, '[riferimento interno]').replace(/\s{2,}/g, ' ').trim()
}

export function redactEvidenceLinesForUi(lines: string[]): string[] {
  return lines.map((x) => redactTechnicalIdsInEvidenceLine(x))
}
