import { describe, it, expect } from 'vitest'
import { decide, decideCall, isSafeBashCommand } from '../src/permission.js'

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

describe('isSafeBashCommand', () => {
  it('accepts common read-only commands', () => {
    for (const c of ['ls -la', 'pwd', 'cat package.json', 'git status', 'git log --oneline -5', 'git diff HEAD~1', 'ls | head -3', 'rg -n "foo" src', 'du -sh .']) {
      expect(isSafeBashCommand(c), c).toBe(true)
    }
  })
  it('rejects mutating, executing, or redirecting commands', () => {
    for (const c of [
      'rm -rf /', 'npm install', 'node -e "x"', 'git push', 'git commit -m hi',
      'echo hi > file.txt', 'cat a `rm b`', 'ls $(rm x)', 'ls; rm x', 'FOO=1 ls',
      'python3 script.py', 'ls &', 'curl example.com', '',
    ]) {
      expect(isSafeBashCommand(c), c).toBe(false)
    }
  })
})

describe('decideCall', () => {
  it('auto-allows safe Bash in default mode but still asks for mutations', () => {
    expect(decideCall({ name: 'Bash', arguments: { command: 'git status' } }, 'default')).toBe('allow')
    expect(decideCall({ name: 'Bash', arguments: { command: 'npm install' } }, 'default')).toBe('ask')
  })
  it('still denies Bash in plan mode even when the command is read-only', () => {
    expect(decideCall({ name: 'Bash', arguments: { command: 'ls' } }, 'plan')).toBe('deny')
  })
  it('falls back to decide() for non-Bash tools', () => {
    expect(decideCall({ name: 'Write', arguments: {} }, 'default')).toBe('ask')
    expect(decideCall({ name: 'Read', arguments: {} }, 'default')).toBe('allow')
  })
})
