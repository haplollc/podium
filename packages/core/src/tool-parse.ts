import type { ToolCall } from '@podium/providers'

export interface ParsedTools {
  calls: ToolCall[]
  cleanedText: string   // input text with the recognized tool-call JSON removed
}

/**
 * Fallback for models that emit tool calls as plain-text JSON instead of using
 * the native tool_calls field (common with small/quantized local models).
 * Extracts `{ "name": <known tool>, "arguments": {...} }` objects (optionally
 * fenced in ``` blocks, optionally with double-encoded arguments).
 */
export function extractToolCalls(text: string, knownNames: string[]): ParsedTools {
  const known = new Set(knownNames)
  const objects = findJsonObjects(stripFences(text))
  const calls: ToolCall[] = []
  let cleaned = text
  let idx = 0
  for (const obj of objects) {
    const rec = obj.value as Record<string, unknown>
    const name = typeof rec.name === 'string' ? rec.name : undefined
    if (!name || !known.has(name)) continue
    let args: unknown = rec.arguments ?? rec.parameters ?? {}
    if (typeof args === 'string') {
      try { args = JSON.parse(args) } catch { /* leave as-is below */ }
    }
    if (typeof args !== 'object' || args === null) args = {}
    calls.push({ id: `text_${name}_${idx++}`, name, arguments: args as Record<string, unknown> })
    cleaned = cleaned.replace(obj.raw, '')
  }
  return { calls, cleanedText: cleanModelText(cleaned) }
}

/**
 * Tidy model text for display: drop empty/leftover code fences (e.g. the
 * ```json ``` wrappers small models leave behind after a tool call) and trim.
 */
export function cleanModelText(text: string): string {
  return stripSpecialTokens(text)
    .replace(/```[a-zA-Z]*[ \t]*\n?[ \t]*```/g, '') // empty fenced blocks
    .replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')     // orphan fence lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Strip chat-template control tokens that some models leak into their output
 * (Qwen <|im_start|>/<|im_end|>, Llama <|eot_id|>, ChatML, etc.). Left in, they
 * clutter the UI and can derail the model on the next turn.
 */
export function stripSpecialTokens(text: string): string {
  return text
    .replace(/<\|[^|>]*\|>/g, '')          // <|im_start|>, <|im_end|>, <|eot_id|>, …
    .replace(/<\/?(s|assistant|user|system)>/gi, '') // stray role/BOS tags
}

function stripFences(s: string): string {
  return s.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '')
}

/** Find top-level balanced {...} substrings that parse as JSON, quote-aware. */
function findJsonObjects(s: string): Array<{ raw: string; value: unknown }> {
  const out: Array<{ raw: string; value: unknown }> = []
  let i = 0
  while (i < s.length) {
    if (s[i] === '{') {
      const end = matchBrace(s, i)
      if (end > i) {
        const raw = s.slice(i, end + 1)
        const value = tolerantParse(raw)
        if (value !== undefined) out.push({ raw, value })
        i = end + 1
        continue
      }
    }
    i++
  }
  return out
}

/**
 * Parse a JSON object, tolerating the #1 malformation small models produce:
 * literal newlines / tabs / carriage-returns inside string values (e.g. a
 * multi-line file `content` in a Write call). Without this, JSON.parse throws
 * and the whole tool call (the Write!) is silently dropped.
 */
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

function matchBrace(s: string, start: number): number {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return i }
  }
  return -1
}
