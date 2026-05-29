/** Minimal LCS line diff → unified-style entries. */
function diffLines(a: string[], b: string[]): Array<{ t: ' ' | '+' | '-'; line: string }> {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: Array<{ t: ' ' | '+' | '-'; line: string }> = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: ' ', line: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', line: a[i] }); i++ }
    else { out.push({ t: '+', line: b[j] }); j++ }
  }
  while (i < m) out.push({ t: '-', line: a[i++] })
  while (j < n) out.push({ t: '+', line: b[j++] })
  return out
}

/**
 * A compact diff summary for a file change: a `path (+adds -dels)` header followed
 * by the changed lines (prefixed +/-), capped. Used by Write/Edit so the log shows
 * what actually changed.
 */
export function diffSummary(oldText: string, newText: string, label: string, maxLines = 20): string {
  const a = oldText ? oldText.split('\n') : []
  const b = newText.split('\n')
  if (a.length + b.length > 1500) return `${label}  (+${b.length} -${a.length} lines)`
  const d = diffLines(a, b)
  const adds = d.filter((x) => x.t === '+').length
  const dels = d.filter((x) => x.t === '-').length
  const changed = d.filter((x) => x.t !== ' ')
  const shown = changed.slice(0, maxLines).map((x) => `${x.t} ${x.line}`)
  const more = changed.length > maxLines ? `\n… +${changed.length - maxLines} more changed lines` : ''
  return `${label}  (+${adds} -${dels})\n${shown.join('\n')}${more}`
}
