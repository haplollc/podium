import React from 'react'
import { Box, Text } from 'ink'
import type { ContextStats } from '@podium/core'

export interface MetricsData {
  model: string
  contextStats: ContextStats
  modelMemGB: number | null   // resident model memory (from the backend), if known
  ramUsedGB: number
  ramTotalGB: number
  tokensPerSec: number | null // generation speed of the last/active turn
}

function k(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function meter(frac: number, width = 8): string {
  const f = Math.max(0, Math.min(1, frac))
  const filled = Math.round(f * width)
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

/** Live dashboard shown over the input area (toggle with /metrics). */
export function MetricsBar({ m }: { m: MetricsData }): React.ReactElement {
  const s = m.contextStats
  const pct = Math.min(100, Math.round(s.percentUsed * 100))
  const ctxColor = pct > 85 ? 'red' : pct > 65 ? 'yellow' : 'green'
  const ramFrac = m.ramTotalGB ? m.ramUsedGB / m.ramTotalGB : 0
  const ramColor = ramFrac > 0.9 ? 'red' : ramFrac > 0.75 ? 'yellow' : 'green'

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Text>
        <Text dimColor>◆ </Text><Text bold>{m.model}</Text>
        {m.modelMemGB != null ? <Text color="green">  ·  {m.modelMemGB.toFixed(1)} GB resident</Text> : ''}
        {m.tokensPerSec != null ? <Text dimColor>  ·  {m.tokensPerSec.toFixed(0)} tok/s</Text> : ''}
      </Text>
      <Text>
        <Text dimColor>ctx </Text><Text color={ctxColor}>{meter(s.percentUsed)}</Text> {pct}% {k(s.used)}/{k(s.effective)}
        <Text dimColor>    ram </Text><Text color={ramColor}>{meter(ramFrac)}</Text> {m.ramUsedGB.toFixed(1)}/{m.ramTotalGB} GB
      </Text>
    </Box>
  )
}
