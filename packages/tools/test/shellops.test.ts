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

  it('bash accepts cmd as a command alias', async () => {
    const out = await bashTool.run({ cmd: 'echo alias-ok' }, { cwd: dir })
    expect(out).toContain('alias-ok')
  })

  it('bash fails clearly when command is missing', async () => {
    await expect(bashTool.run({}, { cwd: dir })).rejects.toThrow(/Missing required argument "command"/)
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

import { normalizePython } from '../src/bash.js'
describe('normalizePython', () => {
  it('rewrites bare python/pip to python3/pip3 only when needed, at command position', async () => {
    // We can't control which binaries exist on CI, so just assert it never breaks
    // python3 or substrings, and is idempotent.
    const a = await normalizePython('python3 foo.py', process.cwd())
    expect(a).toBe('python3 foo.py')           // never python3 -> python33
    const b = await normalizePython('echo mypythonthing', process.cwd())
    expect(b).toBe('echo mypythonthing')       // substring untouched
    const c = await normalizePython('ls', process.cwd())
    expect(c).toBe('ls')
  })
})

import { mkdir as _mkdir, writeFile as _wf } from 'node:fs/promises'
describe('Glob ignores heavy dirs', () => {
  it('skips node_modules / .git when matching **/*', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const os = await import('node:os'); const p = await import('node:path')
    const d = await mkdtemp(p.join(os.tmpdir(), 'glob-'))
    await _mkdir(p.join(d, 'node_modules', 'pkg'), { recursive: true })
    await _wf(p.join(d, 'node_modules', 'pkg', 'index.js'), '')
    await _wf(p.join(d, 'app.ts'), '')
    const out = await globTool.run({ pattern: '**/*' }, { cwd: d })
    expect(out).toContain('app.ts')
    expect(out).not.toContain('node_modules')
    await rm(d, { recursive: true, force: true })
  })
})
