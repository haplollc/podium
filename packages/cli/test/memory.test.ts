import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadMemory } from '../src/memory.js'

let home: string
let cwd: string
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'maestro-home-'))
  cwd = await mkdtemp(path.join(tmpdir(), 'maestro-cwd-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

describe('loadMemory', () => {
  it('returns empty string when no memory files exist', async () => {
    expect(await loadMemory(cwd, home)).toBe('')
  })

  it('concatenates user then project memory', async () => {
    await mkdir(path.join(home, '.maestro'), { recursive: true })
    await writeFile(path.join(home, '.maestro', 'MAESTRO.md'), 'user rule')
    await writeFile(path.join(cwd, 'MAESTRO.md'), 'project rule')
    const mem = await loadMemory(cwd, home)
    expect(mem).toContain('user rule')
    expect(mem).toContain('project rule')
    expect(mem.indexOf('user rule')).toBeLessThan(mem.indexOf('project rule'))
  })

  it('honors CLAUDE.md for compatibility', async () => {
    await writeFile(path.join(cwd, 'CLAUDE.md'), 'claude compat rule')
    expect(await loadMemory(cwd, home)).toContain('claude compat rule')
  })
})
