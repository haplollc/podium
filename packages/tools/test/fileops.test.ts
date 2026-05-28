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

  it('write creates a file', async () => {
    const f = path.join(dir, 'b.txt')
    await writeTool.run({ file_path: f, content: 'new content' }, { cwd: dir })
    expect(await readFile(f, 'utf8')).toBe('new content')
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
})
