// Tool output goes straight into a small context window, so cap it three ways:
// line count (caller-chosen), per-line length (one minified/base64 line can't
// blow the budget), and a total-character backstop.
const MAX_LINE_CHARS = 500
const MAX_TOTAL_CHARS = 30000

export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  let note = ''
  let kept = lines
  if (lines.length > maxLines) {
    kept = lines.slice(0, maxLines)
    note = `\n… ${lines.length - maxLines} more lines (truncated)`
  }
  let clipped = false
  const safe = kept.map(l => {
    if (l.length <= MAX_LINE_CHARS) return l
    clipped = true
    return `${l.slice(0, MAX_LINE_CHARS)}… [line truncated]`
  })
  let out = clipped || note ? safe.join('\n') : text
  if (out.length > MAX_TOTAL_CHARS) {
    out = `${out.slice(0, MAX_TOTAL_CHARS)}\n… (output truncated)`
  }
  return out + note
}
