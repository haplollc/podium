import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadSoul, addLearnedPreference, clearLearnedPreferences, DEFAULT_SOUL, LEARNED_HEADER } from '../src/soul.js'

let home: string
let cwd: string
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'podium-home-'))
  cwd = await mkdtemp(path.join(tmpdir(), 'podium-cwd-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

describe('soul preferences', () => {
  it('seeds from the default voice and appends under the learned header', async () => {
    const next = await addLearnedPreference(cwd, home, 'Keep answers short')
    expect(next).toContain(DEFAULT_SOUL.split('\n')[0])   // base voice retained
    expect(next).toContain(LEARNED_HEADER)
    expect(next).toContain('- Keep answers short')
    // Written to ~/.podium/SOUL.md and reloadable.
    expect(await loadSoul(cwd, home)).toContain('Keep answers short')
  })

  it('does not duplicate an existing preference (case-insensitive)', async () => {
    await addLearnedPreference(cwd, home, 'Use British spelling')
    const next = await addLearnedPreference(cwd, home, 'use british spelling')
    expect(next.match(/british spelling/gi)?.length).toBe(1)
  })

  it('writes to the project SOUL.md when one exists', async () => {
    await writeFile(path.join(cwd, 'SOUL.md'), 'Project voice: terse.')
    await addLearnedPreference(cwd, home, 'Prefer tabs')
    const project = await readFile(path.join(cwd, 'SOUL.md'), 'utf8')
    expect(project).toContain('Project voice: terse.')
    expect(project).toContain('- Prefer tabs')
  })

  it('clear removes learned prefs but keeps a custom base', async () => {
    await writeFile(path.join(cwd, 'SOUL.md'), 'Project voice: terse.')
    await addLearnedPreference(cwd, home, 'Prefer tabs')
    const after = await clearLearnedPreferences(cwd, home)
    expect(after).toContain('Project voice: terse.')
    expect(after).not.toContain('Prefer tabs')
    expect(after).not.toContain(LEARNED_HEADER)
  })

  it('clear falls back to the built-in default when nothing custom remains', async () => {
    await addLearnedPreference(cwd, home, 'Keep answers short')  // base was the default
    const after = await clearLearnedPreferences(cwd, home)
    expect(after).toBe(DEFAULT_SOUL)
  })
})
