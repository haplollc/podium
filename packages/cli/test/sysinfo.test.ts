import { describe, it, expect } from 'vitest'
import { tempZone } from '../src/sysinfo.js'

describe('tempZone', () => {
  it('uses CPU thresholds (70/85)', () => {
    expect(tempZone({ celsius: 55, source: 'cpu' })).toBe('green')
    expect(tempZone({ celsius: 78, source: 'cpu' })).toBe('yellow')
    expect(tempZone({ celsius: 90, source: 'cpu' })).toBe('red')
  })
  it('uses lower battery thresholds (38/44)', () => {
    expect(tempZone({ celsius: 31, source: 'battery' })).toBe('green')
    expect(tempZone({ celsius: 40, source: 'battery' })).toBe('yellow')
    expect(tempZone({ celsius: 46, source: 'battery' })).toBe('red')
  })
})
