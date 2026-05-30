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
  const values = findJsonValues(text)
  const calls: ToolCall[] = []
  let cleaned = text
  let idx = 0
  for (const value of values) {
    const parsed = toolCallsFromValue(value.value, known, () => idx++)
    if (!parsed.length) continue
    calls.push(...parsed)
    cleaned = cleaned.replace(value.raw, '')
  }
  return { calls, cleanedText: cleanModelText(cleaned) }
}

/**
 * Tidy model text for display: drop empty/leftover code fences (e.g. the
 * ```json ``` wrappers small models leave behind after a tool call) and trim.
 */
export function cleanModelText(text: string): string {
  return stripSpecialTokens(text)
    .replace(/<\/?(tool_call|tool|function_call)>/gi, '')
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

/** Find top-level balanced JSON object/array substrings that parse, quote-aware. */
function findJsonValues(s: string): Array<{ raw: string; value: unknown }> {
  const out: Array<{ raw: string; value: unknown }> = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '{' || ch === '[') {
      const end = matchBalanced(s, i, ch, ch === '{' ? '}' : ']')
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

function toolCallsFromValue(value: unknown, known: Set<string>, nextIndex: () => number): ToolCall[] {
  if (Array.isArray(value)) return value.flatMap(v => toolCallsFromValue(v, known, nextIndex))
  if (!isRecord(value)) return []

  const nested = [
    value.tool_calls,
    value.tool_call,
    value.function_call,
    value.tool_use,
  ]
  const nestedCalls = nested.flatMap(v => toolCallsFromValue(v, known, nextIndex))

  const fn = isRecord(value.function) ? value.function : undefined
  const name = firstString(value.name, value.tool, value.tool_name, value.action, fn?.name)
  if (!name || !known.has(name)) return nestedCalls

  const rawArgs = value.arguments ?? value.parameters ?? value.input ?? value.args ?? fn?.arguments ?? fn?.parameters ?? {}
  const args = coerceArguments(rawArgs)
  return [
    ...nestedCalls,
    { id: `text_${name}_${nextIndex()}`, name, arguments: args },
  ]
}

function coerceArguments(value: unknown): Record<string, unknown> {
  let args = value
  if (typeof args === 'string') {
    if (args.trim() === '') return {}
    const parsed = tolerantParse(args)
    if (parsed === undefined) return parseErrorArgs('Tool arguments were not valid JSON.')
    args = parsed
  }
  return isRecord(args) ? args : parseErrorArgs('Tool arguments must be a JSON object.')
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseErrorArgs(message: string): Record<string, unknown> {
  return { __parse_error: message }
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

function matchBalanced(s: string, start: number, open: string, close: string): number {
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
    else if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return i }
  }
  return -1
}
