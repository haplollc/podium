import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bashTool } from '../src/bash.js'
import { grepTool } from '../src/grep.js'
import { globTool } from '../src/glob.js'
import { allTools, toolByName } from '../src/index.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'podium-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('shell tools', () => {
  it('bash runs a command in cwd', async () => {
    const out = await bashTool.run({ command: 'echo hi' }, { cwd: dir })
    expect(out).toContain('hi')
  })

  it('bash surfaces a non-zero exit code', async () => {
    const out = await bashTool.run({ command: 'exit 7' }, { cwd: dir })
    expect(out).toContain('exit=7')
  })

  it('grep finds matching lines', async () => {
    await writeFile(path.join(dir, 'f.ts'), 'const needle = 1\nconst other = 2')
    const out = await grepTool.run({ pattern: 'needle' }, { cwd: dir })
    expect(out).toContain('needle')
  })

  it('grep honors a glob filter', async () => {
    await writeFile(path.join(dir, 'keep.ts'), 'target here')
    await writeFile(path.join(dir, 'skip.md'), 'target here')
    const out = await grepTool.run({ pattern: 'target', glob: '*.ts' }, { cwd: dir })
    expect(out).toContain('keep.ts')
    expect(out).not.toContain('skip.md')
  })

  it('glob lists matching files sorted', async () => {
    await writeFile(path.join(dir, 'a.ts'), '')
    await writeFile(path.join(dir, 'b.js'), '')
    const out = await globTool.run({ pattern: '**/*.ts' }, { cwd: dir })
    expect(out).toContain('a.ts')
    expect(out).not.toContain('b.js')
  })

  it('glob respects an explicit path option', async () => {
    await mkdir(path.join(dir, 'sub'), { recursive: true })
    await writeFile(path.join(dir, 'sub', 'inner.ts'), '')
    const out = await globTool.run({ pattern: '*.ts', path: path.join(dir, 'sub') }, { cwd: dir })
    expect(out).toContain('inner.ts')
  })

  it('allTools includes the core file/shell tools and toolByName resolves them', () => {
    const names = allTools.map(t => t.schema.name)
    for (const n of ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'TodoWrite', 'Write', 'WebSearch', 'WebFetch']) {
      expect(names).toContain(n)
    }
    expect(toolByName('Edit')?.schema.name).toBe('Edit')
    expect(toolByName('Nope')).toBeUndefined()
  })
})
