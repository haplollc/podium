import { describe, it, expect } from 'vitest'
import { decide } from '../src/permission.js'

describe('permission decide', () => {
  it('always allows read-only tools', () => {
    for (const m of ['default', 'acceptEdits', 'plan', 'yolo'] as const) {
      expect(decide('Read', m)).toBe('allow')
      expect(decide('Grep', m)).toBe('allow')
    }
  })
  it('asks before mutations in default mode', () => {
    expect(decide('Write', 'default')).toBe('ask')
    expect(decide('Bash', 'default')).toBe('ask')
  })
  it('auto-allows edits but still asks for Bash in acceptEdits', () => {
    expect(decide('Write', 'acceptEdits')).toBe('allow')
    expect(decide('Edit', 'acceptEdits')).toBe('allow')
    expect(decide('Bash', 'acceptEdits')).toBe('ask')
  })
  it('denies all mutations in plan mode', () => {
    expect(decide('Write', 'plan')).toBe('deny')
    expect(decide('Bash', 'plan')).toBe('deny')
  })
  it('allows everything in yolo mode', () => {
    expect(decide('Write', 'yolo')).toBe('allow')
    expect(decide('Bash', 'yolo')).toBe('allow')
  })
})
