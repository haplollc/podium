import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { candidatePaths, resolveAttachments, buildAttachedMessage } from '../src/attachments.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'att-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('candidatePaths', () => {
  it('extracts quoted, backslash-escaped, and bare paths', () => {
    const c = candidatePaths(`look at '/a/b c.png' and /x/y.ts and /p/My\\ File.md`)
    expect(c).toContain('/a/b c.png')
    expect(c).toContain('/x/y.ts')
    expect(c).toContain('/p/My File.md')
  })
  it('ignores prose with no path', () => {
    expect(candidatePaths('just a normal message')).toEqual([])
  })
})

describe('resolveAttachments', () => {
  it('reads a text file into an attachment and strips its path from the text', async () => {
    const f = path.join(dir, 'notes.md')
    await writeFile(f, '# Title\nbody text')
    const { attachments, cleanedText } = await resolveAttachments(`summarize ${f}`, dir)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].kind).toBe('text')
    expect(attachments[0].text).toContain('body text')
    expect(cleanedText).toBe('summarize')
  })

  it('base64-encodes an image attachment', async () => {
    const f = path.join(dir, 'pic.png')
    await writeFile(f, Buffer.from([0x89, 0x50, 0x4e, 0x47]))  // PNG magic
    const { attachments } = await resolveAttachments(f, dir)
    expect(attachments[0].kind).toBe('image')
    expect(attachments[0].base64).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'))
  })

  it('ignores paths that do not exist', async () => {
    const { attachments } = await resolveAttachments('/nope/missing.txt please', dir)
    expect(attachments).toEqual([])
  })
})

describe('buildAttachedMessage', () => {
  it('embeds text files as <attached> blocks before the user text', () => {
    const { content, images } = buildAttachedMessage('summarize this', [
      { path: '/x/a.md', name: 'a.md', kind: 'text', text: 'hello', note: '' },
    ])
    expect(content).toContain('<attached file="a.md">')
    expect(content).toContain('hello')
    expect(content.trimEnd().endsWith('summarize this')).toBe(true)
    expect(images).toEqual([])
  })

  it('collects image base64 separately and defaults content for image-only messages', () => {
    const { content, images } = buildAttachedMessage('', [
      { path: '/x/p.png', name: 'p.png', kind: 'image', base64: 'AAAA', note: '' },
    ])
    expect(images).toEqual(['AAAA'])
    expect(content).toMatch(/image/i)
  })
})
