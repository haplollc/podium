import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { FitVerdict } from '@maestro/hardware'

export interface ModelRow {
  id: string
  label: string
  verdict: FitVerdict
  sizeGB: number
  installed: boolean
  tools: boolean
  recommended?: boolean
}

const VERDICT_ICON: Record<FitVerdict, string> = { fits: '🟢', tight: '🟡', 'wont-run': '🔴' }
const VERDICT_WORD: Record<FitVerdict, string> = { fits: 'runs comfortably', tight: 'tight — small context', 'wont-run': "won't fit" }

export function ModelPicker(
  { rows, onSelect, onDelete, onCancel }: {
    rows: ModelRow[]
    onSelect: (row: ModelRow) => void
    onDelete?: (row: ModelRow) => void
    onCancel?: () => void
  },
): React.ReactElement {
  const selectable = rows.filter(r => r.verdict !== 'wont-run')
  const [idx, setIdx] = useState(() => {
    const r = selectable.findIndex(s => s.recommended)
    return r >= 0 ? r : 0
  })
  useInput((input, key) => {
    if (key.upArrow) setIdx(i => Math.max(0, i - 1))
    else if (key.downArrow) setIdx(i => Math.min(selectable.length - 1, i + 1))
    else if (key.escape) onCancel?.()
    else if ((input === 'd' || input === 'D') && selectable[idx]?.installed) onDelete?.(selectable[idx])
    else if (key.return && selectable[idx]) onSelect(selectable[idx])
  })

  const current = selectable[idx]

  return (
    <Box flexDirection="column">
      {rows.map((r) => {
        const sel = current?.id === r.id
        const disabled = r.verdict === 'wont-run'
        return (
          <Text key={r.id} color={disabled ? 'gray' : sel ? 'cyan' : undefined}>
            {sel ? '❯ ' : '  '}{VERDICT_ICON[r.verdict]} {r.label.padEnd(22)} {`${r.sizeGB} GB`.padStart(7)}
            {r.recommended ? <Text color="green"> ★ recommended</Text> : ''}
            {r.tools ? '' : <Text color="yellow"> · chat-only</Text>}
            {r.installed ? <Text color="green"> · ✓ installed</Text> : <Text dimColor> · ⤓ download</Text>}
          </Text>
        )
      })}

      {current && (
        <Box marginTop={1}>
          <Text dimColor>
            {current.label} · {VERDICT_WORD[current.verdict]} · {current.installed
              ? 'already installed — Enter to use it.'
              : `not installed — Enter to download (~${current.sizeGB} GB, one time).`}
          </Text>
        </Box>
      )}

      <Text dimColor>
        ↑/↓ move · Enter select
        {onDelete && current?.installed ? ' · d delete' : ''}
        {onCancel ? ' · Esc back' : ''}
      </Text>
    </Box>
  )
}
