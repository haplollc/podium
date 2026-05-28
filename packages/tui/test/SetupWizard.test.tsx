import { describe, it, expect } from 'vitest'
import { buildModelRows } from '../src/SetupWizard.js'
import type { CatalogModel } from '@maestro/providers'
import type { SystemInfo } from '@maestro/hardware'

const sys: SystemInfo = {
  totalMemoryBytes: 16 * 1024 ** 3, totalMemoryGB: 16, usableMemoryGB: 11.2,
  chip: 'Apple M1', arch: 'arm64', cpuCores: 8,
}
const cat: CatalogModel[] = [
  { id: 'qwen2.5-coder:7b', label: '7B', params: '7B', quant: 'Q4', weightsGB: 4.7,
    kvPerKTokenGB: 0.12, defaultContext: 16384, tools: true, minTierGB: 16, recommendedForGB: [16] },
  { id: 'qwen3-coder:30b', label: '30B', params: '30B', quant: 'Q4', weightsGB: 18,
    kvPerKTokenGB: 0.2, defaultContext: 32768, tools: true, minTierGB: 32, recommendedForGB: [32] },
]

describe('buildModelRows', () => {
  it('computes verdicts and flags installed models', () => {
    const rows = buildModelRows(cat, sys, new Set(['qwen2.5-coder:7b']))
    const r7 = rows.find(r => r.id === 'qwen2.5-coder:7b')!
    const r30 = rows.find(r => r.id === 'qwen3-coder:30b')!
    expect(r7.verdict).toBe('fits')
    expect(r7.installed).toBe(true)
    expect(r30.verdict).toBe('wont-run')
  })
})
