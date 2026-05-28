import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bashTool } from '../src/bash.js'
import { grepTool } from '../src/grep.js'
import { globTool } from '../src/glob.js'
import { allTools } from '../src/index.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'maestro-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('shell tools', () => {
  it('bash runs a command in cwd', async () => {
    const out = await bashTool.run({ command: 'echo hi' }, { cwd: dir })
    expect(out).toContain('hi')
  })
  it('grep finds matching lines', async () => {
    await writeFile(path.join(dir, 'f.ts'), 'const needle = 1\nconst other = 2')
    const out = await grepTool.run({ pattern: 'needle' }, { cwd: dir })
    expect(out).toContain('needle')
  })
  it('glob lists matching files', async () => {
    await writeFile(path.join(dir, 'a.ts'), '')
    await writeFile(path.join(dir, 'b.js'), '')
    const out = await globTool.run({ pattern: '**/*.ts' }, { cwd: dir })
    expect(out).toContain('a.ts')
    expect(out).not.toContain('b.js')
  })
  it('allTools exposes the six core tools', () => {
    const names = allTools.map(t => t.schema.name).sort()
    expect(names).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'])
  })
})
