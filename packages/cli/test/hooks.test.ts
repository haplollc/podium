import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadHooks, runHooks } from '../src/hooks.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'podium-hooks-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('loadHooks', () => {
  it('returns {} when settings are missing', async () => {
    expect(await loadHooks(dir)).toEqual({})
  })
  it('reads the hooks block from settings.json', async () => {
    await writeFile(path.join(dir, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ command: 'true' }] } }))
    const cfg = await loadHooks(dir)
    expect(cfg.PreToolUse).toHaveLength(1)
  })
})

describe('runHooks', () => {
  it('allows when a PreToolUse hook exits 0', async () => {
    expect(await runHooks({ PreToolUse: [{ command: 'true' }] }, 'PreToolUse', {})).toBe(true)
  })
  it('denies when a PreToolUse hook exits non-zero', async () => {
    expect(await runHooks({ PreToolUse: [{ command: 'exit 2' }] }, 'PreToolUse', {})).toBe(false)
  })
  it('denies when a PreToolUse hook prints {"decision":"deny"}', async () => {
    expect(await runHooks({ PreToolUse: [{ command: 'echo \'{"decision":"deny"}\'' }] }, 'PreToolUse', {})).toBe(false)
  })
  it('ignores results for non-PreToolUse events', async () => {
    expect(await runHooks({ SessionStart: [{ command: 'exit 3' }] }, 'SessionStart', {})).toBe(true)
  })
})
