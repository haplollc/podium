import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { globTool } from '../src/glob.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'podium-glob-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('globTool', () => {
  it('finds matching files with a narrow pattern', async () => {
    await writeFile(path.join(dir, 'Resume.pdf'), 'x')
    await writeFile(path.join(dir, 'notes.txt'), 'x')
    const out = await globTool.run({ pattern: '**/*.pdf' }, { cwd: dir })
    expect(out).toContain('Resume.pdf')
    expect(out).not.toContain('notes.txt')
  })

  it('prunes heavy dirs (node_modules) instead of walking into them', async () => {
    await mkdir(path.join(dir, 'node_modules', 'big'), { recursive: true })
    await writeFile(path.join(dir, 'node_modules', 'big', 'junk.js'), 'x')
    await writeFile(path.join(dir, 'app.js'), 'x')
    const out = await globTool.run({ pattern: '**/*.js' }, { cwd: dir })
    expect(out).toContain('app.js')
    expect(out).not.toContain('junk.js')
  })
})
