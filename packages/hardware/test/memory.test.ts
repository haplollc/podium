import { describe, it, expect, vi } from 'vitest'
import { computeSystemInfo } from '../src/memory.js'

describe('computeSystemInfo', () => {
  it('derives GB and usable memory from a sysctl runner', async () => {
    const fakeSysctl = vi.fn(async (key: string) => {
      const map: Record<string, string> = {
        'hw.memsize': '25769803776',          // 24 GiB
        'machdep.cpu.brand_string': 'Apple M2',
        'hw.ncpu': '8',
      }
      return map[key] ?? ''
    })
    const info = await computeSystemInfo({ sysctl: fakeSysctl, arch: 'arm64' })
    expect(info.totalMemoryGB).toBe(24)
    expect(info.usableMemoryGB).toBeCloseTo(16.8, 1) // 0.7 * 24
    expect(info.chip).toBe('Apple M2')
    expect(info.cpuCores).toBe(8)
    expect(info.arch).toBe('arm64')
  })
})
