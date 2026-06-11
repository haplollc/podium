import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ToolCall } from '@podium/providers'

export type PermissionAnswer = 'yes' | 'always' | 'no'

/** Compact one-line label for the action being approved (no raw JSON dump). */
function describe(call: ToolCall): string {
  const a = call.arguments ?? {}
  const base = (p: unknown) => String(p ?? '').split('/').filter(Boolean).pop() ?? ''
  const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
  const file = a.file_path ?? a.path ?? a.file
  const cmd = a.command ?? a.cmd
  switch (call.name) {
    case 'Bash': return `Bash › ${clip(cmd, 60)}`
    case 'Write': return `Write › ${base(file)}`
    case 'Edit': return `Edit › ${base(file)}`
    default: return call.name
  }
}

const OPTIONS: Array<{ label: string; value: PermissionAnswer; color: string }> = [
  { label: 'Yes, run it', value: 'yes', color: 'green' },
  { label: 'Always (this session)', value: 'always', color: 'cyan' },
  { label: 'No, skip it', value: 'no', color: 'red' },
]

/** Arrow-selectable approval prompt: ←/→ or ↑/↓ to choose, Enter to confirm, Esc denies. */
export function PermissionPrompt(
  { call, onDecision }: { call: ToolCall; onDecision: (answer: PermissionAnswer) => void },
): React.ReactElement {
  const [idx, setIdx] = useState(0)
  useInput((input, key) => {
    if (key.leftArrow || key.upArrow) setIdx(i => (i + OPTIONS.length - 1) % OPTIONS.length)
    else if (key.rightArrow || key.downArrow || key.tab) setIdx(i => (i + 1) % OPTIONS.length)
    else if (key.return) onDecision(OPTIONS[idx].value)
    else if (key.escape) onDecision('no')
    else if (input === 'y' || input === 'Y') onDecision('yes')
    else if (input === 'a' || input === 'A') onDecision('always')
    else if (input === 'n' || input === 'N') onDecision('no')
  })
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow">Allow this action?</Text>
      <Text>  {describe(call)}</Text>
      <Box marginTop={1}>
        {OPTIONS.map((o, i) => (
          <Text key={o.label} color={i === idx ? 'black' : o.color} backgroundColor={i === idx ? o.color : undefined}>
            {i === idx ? ' ❯ ' : '   '}{o.label}{'  '}
          </Text>
        ))}
      </Box>
      <Text dimColor>←/→ to choose · Enter confirms · y/a/n · Esc skips · "Always" = stop asking for {call.name} this session</Text>
    </Box>
  )
}
