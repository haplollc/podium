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
}

const VERDICT_ICON: Record<FitVerdict, string> = { fits: '🟢', tight: '🟡', 'wont-run': '🔴' }

export function ModelPicker(
  { rows, onSelect }: { rows: ModelRow[]; onSelect: (row: ModelRow) => void },
): React.ReactElement {
  const selectable = rows.filter(r => r.verdict !== 'wont-run')
  const [idx, setIdx] = useState(0)
  useInput((input, key) => {
    if (key.upArrow) setIdx(i => Math.max(0, i - 1))
    else if (key.downArrow) setIdx(i => Math.min(selectable.length - 1, i + 1))
    else if (key.return && selectable[idx]) onSelect(selectable[idx])
  })
  return (
    <Box flexDirection="column">
      <Text bold>Choose a model for this Mac:</Text>
      {rows.map((r) => {
        const sel = selectable[idx]?.id === r.id
        const disabled = r.verdict === 'wont-run'
        return (
          <Text key={r.id} color={disabled ? 'gray' : sel ? 'cyan' : undefined}>
            {sel ? '❯ ' : '  '}{VERDICT_ICON[r.verdict]} {r.label} · {r.sizeGB}GB
            {r.tools ? '' : ' · chat-only'}{r.installed ? ' · installed' : ' · download'}
          </Text>
        )
      })}
      <Text dimColor>↑/↓ to move · Enter to select</Text>
    </Box>
  )
}
