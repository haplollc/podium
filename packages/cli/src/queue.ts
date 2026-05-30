import { parseSlash } from '@podium/core'

/**
 * Consecutive plain messages can be sent as one combined prompt, but slash
 * commands must stay isolated so queued `/model`, `/clear`, etc. execute as UI
 * commands instead of being sent to the model as prose.
 */
export function groupQueuedInputs(items: string[]): string[] {
  const groups: string[] = []
  let buf: string[] = []
  for (const item of items) {
    if (parseSlash(item)) {
      if (buf.length) {
        groups.push(buf.join('\n\n'))
        buf = []
      }
      groups.push(item)
    } else {
      buf.push(item)
    }
  }
  if (buf.length) groups.push(buf.join('\n\n'))
  return groups
}
