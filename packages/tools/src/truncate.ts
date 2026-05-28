export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  const kept = lines.slice(0, maxLines)
  const remaining = lines.length - maxLines
  return `${kept.join('\n')}\n… ${remaining} more lines (truncated)`
}
