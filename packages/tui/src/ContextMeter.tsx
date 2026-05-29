import React from 'react'
import { Box, Text } from 'ink'
import type { ContextStats } from '@podium/core'

function k(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function ContextMeter({ stats }: { stats: ContextStats }): React.ReactElement {
  const pct = Math.min(100, Math.round(stats.percentUsed * 100))
  const filled = Math.round((pct / 100) * 10)
  const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled)
  const color = pct > 85 ? 'red' : pct > 65 ? 'yellow' : 'green'
  return (
    <Box>
      <Text color={color}>{bar} </Text>
      <Text>{pct}% · {k(stats.used)}/{k(stats.effective)}</Text>
    </Box>
  )
}
