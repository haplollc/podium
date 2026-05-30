import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readTool } from '../src/read.js'
import { writeTool } from '../src/write.js'
import { editTool } from '../src/edit.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'podium-')) })
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

  it('write creates a file and returns a diff', async () => {
    const f = path.join(dir, 'b.txt')
    const res = await writeTool.run({ file_path: f, content: 'new content' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('new content')
    expect(res).toContain('Created b.txt')
    expect(res).toContain('+ new content')
  })

  it('write creates intermediate directories', async () => {
    const f = path.join(dir, 'nested/deep/c.txt')
    await writeTool.run({ file_path: f, content: 'x' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('x')
  })

  it('file tools accept common local-model path aliases', async () => {
    const f = path.join(dir, 'alias.txt')
    await writeTool.run({ path: f, text: 'hello alias' }, { cwd: dir })
    const read = await readTool.run({ path: f }, { cwd: dir })
    expect(read).toContain('hello alias')
    await editTool.run({ path: f, old: 'alias', new: 'world' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('hello world')
  })

  it('file tools fail clearly when required arguments are missing', async () => {
    await expect(readTool.run({}, { cwd: dir })).rejects.toThrow(/Missing required argument "file_path"/)
    await expect(writeTool.run({ file_path: path.join(dir, 'x') }, { cwd: dir })).rejects.toThrow(/Missing required argument "content"/)
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
    expect(res).toContain('Edited e.txt')
    expect(res).toContain('+ b b b')
  })
})

import { writeTool as _wt } from '../src/write.js'
describe('Write empty-content guard', () => {
  it('refuses empty/whitespace content instead of writing a blank file', async () => {
    const d = await import('node:fs/promises').then(m => m.mkdtemp(require('node:path').join(require('node:os').tmpdir(), 'w-')))
    const out = await _wt.run({ file_path: require('node:path').join(d, 'x.py'), content: '   \n\n' }, { cwd: d })
    expect(out).toMatch(/empty content/i)
  })
})
