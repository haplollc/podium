import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { estimateFit, type SystemInfo } from '@maestro/hardware'
import type { CatalogModel, Provider, PullProgress } from '@maestro/providers'
import { ModelPicker, type ModelRow } from './ModelPicker.js'

export function buildModelRows(cat: CatalogModel[], sys: SystemInfo, installed: Set<string>): ModelRow[] {
  return cat.map((m) => {
    const fit = estimateFit(
      { weightsGB: m.weightsGB, contextTokens: m.defaultContext, kvPerKTokenGB: m.kvPerKTokenGB },
      sys,
    )
    return {
      id: m.id, label: m.label, verdict: fit.verdict, sizeGB: m.weightsGB,
      installed: installed.has(m.id), tools: m.tools,
    }
  })
}

export interface WizardResult { model: string; contextSize: number }

export function SetupWizard(props: {
  sys: SystemInfo
  catalog: CatalogModel[]
  installed: Set<string>
  provider: Provider
  onComplete: (r: WizardResult) => void
}): React.ReactElement {
  const rows = buildModelRows(props.catalog, props.sys, props.installed)
  const [pull, setPull] = useState<PullProgress | null>(null)
  const [pulling, setPulling] = useState(false)

  async function choose(row: ModelRow) {
    const model = props.catalog.find(m => m.id === row.id)!
    if (!row.installed) {
      setPulling(true)
      await props.provider.pull(row.id, p => setPull(p))
      setPulling(false)
    }
    props.onComplete({ model: row.id, contextSize: model.defaultContext })
  }

  if (pulling) {
    const pct = pull?.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : 0
    return <Text>Downloading… {pull?.status} {pct}%</Text>
  }

  return (
    <Box flexDirection="column">
      <Text bold>Maestro setup · {props.sys.chip} · {props.sys.totalMemoryGB}GB</Text>
      <ModelPicker rows={rows} onSelect={choose} />
    </Box>
  )
}
