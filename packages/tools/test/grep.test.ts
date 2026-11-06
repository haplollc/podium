import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { grepTool } from '../src/grep.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'podium-grep-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('grepTool', () => {
  it('finds matching lines with file:line locations', async () => {
    await writeFile(path.join(dir, 'a.ts'), 'const needle = 1\nconst other = 2\n')
    await writeFile(path.join(dir, 'b.ts'), 'no match here\n')
    const out = await grepTool.run({ pattern: 'needle' }, { cwd: dir })
    expect(out).toContain('a.ts')
    expect(out).toContain('1')          // line number
    expect(out).toContain('needle')
    expect(out).not.toContain('b.ts')
  })

  it('applies the glob filter', async () => {
    await writeFile(path.join(dir, 'code.ts'), 'shared token\n')
    await writeFile(path.join(dir, 'notes.md'), 'shared token\n')
    const out = await grepTool.run({ pattern: 'shared', glob: '*.ts' }, { cwd: dir })
    expect(out).toContain('code.ts')
    expect(out).not.toContain('notes.md')
  })

  it('searches for patterns and paths that start with a dash', async () => {
    await writeFile(path.join(dir, 'notes.txt'), 'npm install --save-dev vitest\n')
    await writeFile(path.join(dir, '-draft.md'), 'needle in a draft\n')
    const flagLike = await grepTool.run({ pattern: '--save-dev' }, { cwd: dir })
    expect(flagLike).toContain('notes.txt')
    expect(flagLike).toContain('--save-dev vitest')
    const dashPath = await grepTool.run({ pattern: 'needle', path: '-draft.md' }, { cwd: dir })
    expect(dashPath).toContain('needle in a draft')
  })

  it('reports (no matches) cleanly', async () => {
    await writeFile(path.join(dir, 'a.txt'), 'hello\n')
    const out = await grepTool.run({ pattern: 'zzz_absent' }, { cwd: dir })
    expect(out).toContain('(no matches)')
  })
})
