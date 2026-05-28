import { describe, it, expect } from 'vitest'
import { estimateFit } from '../src/fit.js'
import type { SystemInfo } from '../src/types.js'

const sys24: SystemInfo = {
  totalMemoryBytes: 24 * 1024 ** 3, totalMemoryGB: 24, usableMemoryGB: 16.8,
  chip: 'Apple M2', arch: 'arm64', cpuCores: 8,
}

describe('estimateFit', () => {
  it('marks a 7B Q4 model as a green fit on 24GB', () => {
    const r = estimateFit({ weightsGB: 4.7, contextTokens: 8192, kvPerKTokenGB: 0.12 }, sys24)
    expect(r.requiredGB).toBeGreaterThan(4.7)   // weights + kv + overhead
    expect(r.verdict).toBe('fits')
  })

  it('marks a 70B Q4 model as wont-run on 24GB', () => {
    const r = estimateFit({ weightsGB: 42, contextTokens: 8192, kvPerKTokenGB: 0.5 }, sys24)
    expect(r.verdict).toBe('wont-run')
  })

  it('marks a borderline model as tight', () => {
    // weights 13 + kv(8k*0.18=1.47) + overhead 2 = ~16.5 vs 16.8 usable
    const r = estimateFit({ weightsGB: 13, contextTokens: 8192, kvPerKTokenGB: 0.18, overheadGB: 2 }, sys24)
    expect(r.verdict).toBe('tight')
  })

  it('reports headroom (usable - required)', () => {
    const r = estimateFit({ weightsGB: 4.7, contextTokens: 8192, kvPerKTokenGB: 0.12, overheadGB: 2 }, sys24)
    expect(r.headroomGB).toBeCloseTo(r.usableGB - r.requiredGB, 1)
    expect(r.headroomGB).toBeGreaterThan(0)
  })

  it('larger context shrinks headroom via the KV-cache term', () => {
    const small = estimateFit({ weightsGB: 7, contextTokens: 4096, kvPerKTokenGB: 0.2 }, sys24)
    const large = estimateFit({ weightsGB: 7, contextTokens: 32768, kvPerKTokenGB: 0.2 }, sys24)
    expect(large.requiredGB).toBeGreaterThan(small.requiredGB)
    expect(large.headroomGB).toBeLessThan(small.headroomGB)
  })
})
