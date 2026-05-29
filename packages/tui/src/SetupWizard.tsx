import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { estimateFit, type SystemInfo } from '@maestro/hardware'
import { recommendedFor, type CatalogModel, type Provider, type PullProgress } from '@maestro/providers'
import { ModelPicker, type ModelRow } from './ModelPicker.js'

export function buildModelRows(cat: CatalogModel[], sys: SystemInfo, installed: Set<string>): ModelRow[] {
  const rec = recommendedFor(cat, sys.totalMemoryGB)
  return cat.map((m) => {
    const fit = estimateFit(
      { weightsGB: m.weightsGB, contextTokens: m.defaultContext, kvPerKTokenGB: m.kvPerKTokenGB },
      sys,
    )
    return {
      id: m.id, label: m.label, verdict: fit.verdict, sizeGB: m.weightsGB,
      installed: installed.has(m.id), tools: m.tools,
      recommended: rec?.id === m.id && fit.verdict !== 'wont-run',
    }
  })
}

export interface WizardResult { model: string; contextSize: number }

function bar(frac: number, width = 24): string {
  const filled = Math.max(0, Math.min(width, Math.round(frac * width)))
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

function DeleteConfirm({ row, onYes, onNo }: { row: ModelRow; onYes: () => void; onNo: () => void }): React.ReactElement {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y') onYes()
    else if (input.toLowerCase() === 'n' || key.escape) onNo()
  })
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="red">Delete {row.label} ({row.sizeGB} GB)? This frees disk; you can re-download later.</Text>
      <Text><Text color="green">y</Text> delete · <Text color="red">n</Text> keep</Text>
    </Box>
  )
}

export function SetupWizard(props: {
  sys: SystemInfo
  catalog: CatalogModel[]
  installed: Set<string>
  provider: Provider
  onComplete: (r: WizardResult) => void
  onCancel?: () => void
}): React.ReactElement {
  const [installed, setInstalled] = useState<Set<string>>(new Set(props.installed))
  const [pull, setPull] = useState<PullProgress | null>(null)
  const [pulling, setPulling] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ModelRow | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const rows = buildModelRows(props.catalog, props.sys, installed)

  async function choose(row: ModelRow) {
    const model = props.catalog.find(m => m.id === row.id)!
    if (!installed.has(row.id)) {
      setPulling(row.label)
      await props.provider.pull(row.id, p => setPull(p))
      setPulling(null)
    }
    props.onComplete({ model: row.id, contextSize: model.defaultContext })
  }

  async function doDelete(row: ModelRow) {
    setConfirmDelete(null)
    if (!props.provider.remove) { setNote('This backend cannot delete models.'); return }
    setDeleting(row.label)
    try {
      await props.provider.remove(row.id)
      setInstalled(prev => { const next = new Set(prev); next.delete(row.id); return next })
      setNote(`Deleted ${row.label}.`)
    } catch (e) {
      setNote(`Could not delete ${row.label}: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  if (pulling) {
    const frac = pull?.total ? (pull.completed ?? 0) / pull.total : 0
    const gb = pull?.total ? `${((pull.completed ?? 0) / 1e9).toFixed(1)} / ${(pull.total / 1e9).toFixed(1)} GB` : ''
    return (
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
        <Text><Text color="magenta" bold>✦ Downloading {pulling}</Text></Text>
        <Text dimColor>One-time download — cached for next time.</Text>
        <Box marginTop={1}>
          <Text color="cyan">{bar(frac)} </Text>
          <Text>{Math.round(frac * 100)}%  {gb}</Text>
        </Box>
        <Text dimColor>{pull?.status ?? 'starting…'}</Text>
      </Box>
    )
  }

  if (deleting) {
    return (
      <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1}>
        <Text color="yellow">Deleting {deleting}…</Text>
      </Box>
    )
  }

  const fits = rows.filter(r => r.verdict !== 'wont-run').length
  const hidden = rows.length - fits

  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column">
      <Text><Text color="magenta" bold>✦ Maestro setup</Text><Text dimColor>  ·  pick, download, or delete a model</Text></Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text dimColor>Machine  </Text>{props.sys.chip} · {props.sys.totalMemoryGB} GB RAM
          <Text dimColor>  (≈{props.sys.usableMemoryGB} GB usable for a model)</Text>
        </Text>
        <Text>
          <Text dimColor>Backend  </Text><Text color="green">Ollama ✓</Text>
          <Text dimColor>   ·   runs 100% on your machine, nothing leaves it</Text>
        </Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Text dimColor>🟢 runs comfortably   🟡 tight   {hidden > 0 ? `(${hidden} too big for this Mac, hidden)` : ''}</Text>
      </Box>

      {confirmDelete
        ? <DeleteConfirm row={confirmDelete} onYes={() => void doDelete(confirmDelete)} onNo={() => setConfirmDelete(null)} />
        : (
          <>
            <ModelPicker
              rows={rows}
              onSelect={choose}
              onDelete={props.provider.remove ? setConfirmDelete : undefined}
              onCancel={props.onCancel}
            />
            {note ? <Text dimColor>{note}</Text> : null}
          </>
        )}
    </Box>
  )
}
