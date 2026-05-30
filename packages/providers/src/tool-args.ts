export function coerceToolArguments(value: unknown): Record<string, unknown> {
  let args = value
  if (typeof args === 'string') {
    const parsed = tolerantParse(args)
    if (parsed !== undefined) args = parsed
  }
  return isRecord(args) ? args : {}
}

export function streamError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const error = value.error
  if (typeof error === 'string') return error
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return undefined
}

function tolerantParse(raw: string): unknown | undefined {
  try { return JSON.parse(raw) } catch { /* fall through to repair */ }
  try { return JSON.parse(escapeRawControlInStrings(raw)) } catch { return undefined }
}

function escapeRawControlInStrings(s: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (const ch of s) {
    if (esc) { out += ch; esc = false; continue }
    if (ch === '\\') { out += ch; esc = true; continue }
    if (ch === '"') { inStr = !inStr; out += ch; continue }
    if (inStr) {
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
    }
    out += ch
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
