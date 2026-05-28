import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProvider, detectBackends } from '../src/factory.js'

describe('getProvider', () => {
  it('returns the right adapter per backend id', () => {
    expect(getProvider('ollama').id).toBe('ollama')
    expect(getProvider('lmstudio').id).toBe('lmstudio')
    expect(getProvider('mlx').id).toBe('mlx')
  })
})

describe('detectBackends', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('returns [] when nothing is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await detectBackends()).toEqual([])
  })
  it('returns only the backends whose health check passes', async () => {
    // ollama tags + openai /models both 200 -> all detected
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const found = await detectBackends()
    expect(found).toContain('ollama')
    expect(found).toContain('lmstudio')
    expect(found).toContain('mlx')
  })
})
