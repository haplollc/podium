import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadHistory, appendHistory, saveSession, loadSession, clearSession } from '../src/persist.js'

async function tmp(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'podium-persist-'))
}

describe('history persistence', () => {
  it('returns [] when no history exists', async () => {
    expect(await loadHistory(await tmp())).toEqual([])
  })
  it('round-trips prompts, including multiline ones', async () => {
    const dir = await tmp()
    await appendHistory('first', dir)
    await appendHistory('two\nlines', dir)
    expect(await loadHistory(dir)).toEqual(['first', 'two\nlines'])
  })
})

describe('session persistence', () => {
  const session = {
    model: 'qwen2.5-coder:14b',
    contextSize: 16384,
    cwd: '/Users/someone/projects/demo',
    savedAt: 123,
    messages: [
      { role: 'user' as const, content: 'hi', images: ['base64stuff'] },
      { role: 'assistant' as const, content: 'hello' },
    ],
    transcript: [{ role: 'user' as const, text: 'hi' }],
  }
  it('round-trips a session per cwd and strips images', async () => {
    const dir = await tmp()
    await saveSession(session, dir)
    const loaded = await loadSession(session.cwd, dir)
    expect(loaded?.model).toBe('qwen2.5-coder:14b')
    expect(loaded?.messages).toHaveLength(2)
    expect(loaded?.messages[0].images).toBeUndefined()
    // a different cwd has no session
    expect(await loadSession('/elsewhere', dir)).toBeNull()
  })
  it('clearSession forgets the saved session', async () => {
    const dir = await tmp()
    await saveSession(session, dir)
    await clearSession(session.cwd, dir)
    expect(await loadSession(session.cwd, dir)).toBeNull()
  })
})
