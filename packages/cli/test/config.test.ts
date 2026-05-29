import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig, saveConfig } from '../src/config.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'podium-cfg-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('config', () => {
  it('returns null when no config exists', async () => {
    expect(await loadConfig(dir)).toBeNull()
  })
  it('round-trips a saved config', async () => {
    await saveConfig({ backend: 'ollama', model: 'qwen2.5-coder:7b', contextSize: 16384 }, dir)
    const cfg = await loadConfig(dir)
    expect(cfg?.model).toBe('qwen2.5-coder:7b')
    expect(cfg?.contextSize).toBe(16384)
  })
})
