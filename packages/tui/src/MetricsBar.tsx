import React from 'react'
import { Box, Text } from 'ink'
import type { ContextStats } from '@podium/core'

export interface MetricsData {
  model: string
  contextStats: ContextStats
  modelMemGB: number | null   // Podium's own footprint: the loaded model's resident memory
  ramUsedGB: number           // whole-device used RAM
  ramTotalGB: number          // whole-device total RAM
  tokensPerSec: number | null // generation speed of the last/active turn
  /** Machine temperature + its zone color (cpu or battery sensor). */
  temp?: { celsius: number; source: 'cpu' | 'battery'; zone: 'green' | 'yellow' | 'red' } | null
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

  // Podium's own RAM = the loaded model's resident memory, as a fraction of total.
  const podiumGB = m.modelMemGB ?? 0
  const podiumFrac = m.ramTotalGB ? podiumGB / m.ramTotalGB : 0
  const podiumColor = podiumFrac > 0.6 ? 'red' : podiumFrac > 0.4 ? 'yellow' : 'green'

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Text>
        <Text dimColor>◆ </Text><Text bold>{m.model}</Text>
        {m.tokensPerSec != null ? <Text dimColor>  ·  {m.tokensPerSec.toFixed(0)} tok/s</Text> : ''}
        {m.temp ? <><Text dimColor>  ·  🌡 </Text><Text color={m.temp.zone}>{m.temp.celsius.toFixed(0)}°C</Text><Text dimColor>{m.temp.source === 'battery' ? ' batt' : ''}</Text></> : ''}
      </Text>
      <Text>
        <Text dimColor>ctx </Text><Text color={ctxColor}>{meter(s.percentUsed)}</Text> {pct}% {k(s.used)}/{k(s.effective)}
      </Text>
      <Text>
        <Text dimColor>ram </Text>
        {m.modelMemGB != null
          ? <><Text color={podiumColor}>{meter(podiumFrac)}</Text> <Text color={podiumColor}>{podiumGB.toFixed(1)} GB podium</Text></>
          : <Text dimColor>{meter(0)} (model not loaded)</Text>}
        <Text dimColor>  ·  {m.ramUsedGB.toFixed(0)}/{m.ramTotalGB} GB device</Text>
      </Text>
    </Box>
  )
}
