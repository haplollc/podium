// Live verification of the two showcase prompts against a real Ollama model.
// Run with:  PODIUM_LIVE=1 pnpm vitest run packages/cli/test/live-demo.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OllamaProvider } from '@podium/providers'
import { ContextManager, buildSystemPrompt, runTurn } from '@podium/core'
import { allTools } from '@podium/tools'

const LIVE = process.env.PODIUM_LIVE === '1'
const MODEL = process.env.PODIUM_MODEL ?? 'qwen2.5-coder:7b'
const provider = new OllamaProvider()
const sys = (cwd: string) => buildSystemPrompt({ cwd, os: process.platform, toolNames: allTools.map(t => t.schema.name) })

describe.skipIf(!LIVE)('live showcase prompts (0.3.x)', () => {
  it('todo prompt: writes todo.py into the cwd, then runs it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-todo-'))
    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'create a Python CLI todo.py with add/list/done commands backed by a JSON file, then run it: add two tasks, mark one done, and print the final list.' })
    const used = new Set<string>()
    const reply = await runTurn({
      provider, model: MODEL, cm, tools: allTools, systemPrompt: sys(dir),
      numCtx: 16384, cwd: dir, keepAlive: '30m',
      onToolStart: (c) => { used.add(c.name); console.log(`[todo] ${c.name}`) },
    })
    console.log('[todo reply]', reply.slice(0, 200))
    const file = await readFile(path.join(dir, 'todo.py'), 'utf8').catch(() => '')
    await rm(dir, { recursive: true, force: true })
    expect(used.has('Write')).toBe(true)        // it created the file
    expect(file.length).toBeGreaterThan(0)        // …in the working dir
  }, 240_000)

  it('web prompt: calls WebSearch instead of refusing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-web-'))
    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'search the web for the newest local coding models on Ollama and print a ranked top 3 right here, each with a one-line summary.' })
    const used = new Set<string>()
    const reply = await runTurn({
      provider, model: MODEL, cm, tools: allTools, systemPrompt: sys(dir),
      numCtx: 16384, cwd: dir, keepAlive: '30m',
      onToolStart: (c) => { used.add(c.name); console.log(`[web] ${c.name}`) },
    })
    console.log('[web reply]', reply.slice(0, 200))
    await rm(dir, { recursive: true, force: true })
    expect(used.has('WebSearch')).toBe(true)              // it actually searched
    expect(reply.toLowerCase()).not.toContain("can't access")
    expect(reply.toLowerCase()).not.toContain('cannot access')
  }, 240_000)
})
