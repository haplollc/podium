import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readTool } from '../src/read.js'
import { writeTool } from '../src/write.js'
import { editTool } from '../src/edit.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'maestro-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('file tools', () => {
  it('read returns numbered lines', async () => {
    const f = path.join(dir, 'a.txt')
    await writeFile(f, 'hello\nworld')
    const out = await readTool.run({ file_path: f }, { cwd: dir })
    expect(out).toContain('1\thello')
    expect(out).toContain('2\tworld')
  })

  it('read caps output at max_lines and marks the remainder', async () => {
    const f = path.join(dir, 'big.txt')
    await writeFile(f, Array.from({ length: 50 }, (_, i) => `row${i}`).join('\n'))
    const out = await readTool.run({ file_path: f, max_lines: 5 }, { cwd: dir })
    expect(out).toContain('1\trow0')
    expect(out).toContain('more lines (truncated)')
    expect(out).not.toContain('row49')
  })

  it('write creates a file and reports byte count', async () => {
    const f = path.join(dir, 'b.txt')
    const res = await writeTool.run({ file_path: f, content: 'new content' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('new content')
    expect(res).toContain('11 bytes')
  })

  it('write creates intermediate directories', async () => {
    const f = path.join(dir, 'nested/deep/c.txt')
    await writeTool.run({ file_path: f, content: 'x' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('x')
  })

  it('edit replaces a unique string and errors on non-unique', async () => {
    const f = path.join(dir, 'c.txt')
    await writeFile(f, 'foo bar foo')
    await expect(editTool.run({ file_path: f, old_string: 'foo', new_string: 'X' }, { cwd: dir }))
      .rejects.toThrow(/not unique/)
    await writeFile(f, 'foo bar')
    await editTool.run({ file_path: f, old_string: 'bar', new_string: 'baz' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('foo baz')
  })

  it('edit errors when old_string is absent', async () => {
    const f = path.join(dir, 'd.txt')
    await writeFile(f, 'hello')
    await expect(editTool.run({ file_path: f, old_string: 'nope', new_string: 'x' }, { cwd: dir }))
      .rejects.toThrow(/not found/)
  })

  it('edit replace_all rewrites every occurrence', async () => {
    const f = path.join(dir, 'e.txt')
    await writeFile(f, 'a a a')
    const res = await editTool.run({ file_path: f, old_string: 'a', new_string: 'b', replace_all: true }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('b b b')
    expect(res).toContain('3 replacements')
  })
})
