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
  it('build-and-run prompt: writes primes.py into the cwd, then runs it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-primes-'))
    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write and run a Python script primes.py that prints the first 15 prime numbers, one per line. show the output here.' })
    const used = new Set<string>()
    let lastOutput = ''
    const reply = await runTurn({
      provider, model: MODEL, cm, tools: allTools, systemPrompt: sys(dir),
      numCtx: 16384, cwd: dir, keepAlive: '30m',
      onToolStart: (c) => { used.add(c.name); console.log(`[primes] ${c.name}`) },
      onToolResult: (_c, r) => { lastOutput = r },
    })
    console.log('[primes out]', lastOutput.split('\n').slice(0, 4).join(' / '))
    const file = await readFile(path.join(dir, 'primes.py'), 'utf8').catch(() => '')
    await rm(dir, { recursive: true, force: true })
    expect(used.has('Write')).toBe(true)
    expect(file.length).toBeGreaterThan(0)
    expect(`${lastOutput}\n${reply}`).toContain('47') // the 15th prime
  }, 240_000)

  it('chart prompt: writes chart.py and prints a bar chart', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-chart-'))
    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write and run a Python script chart.py that prints a labeled ASCII bar chart (using █ blocks) of these values — Mon 3, Tue 7, Wed 2, Thu 9, Fri 5 — and show the output here.' })
    const used = new Set<string>()
    let lastOutput = ''
    const reply = await runTurn({
      provider, model: MODEL, cm, tools: allTools, systemPrompt: sys(dir),
      numCtx: 16384, cwd: dir, keepAlive: '30m',
      onToolStart: (c) => { used.add(c.name); console.log(`[chart] ${c.name}`) },
      onToolResult: (_c, r) => { lastOutput = r },
    })
    console.log('[chart out]', lastOutput.split('\n').slice(0, 6).join(' / '))
    await rm(dir, { recursive: true, force: true })
    expect(used.has('Write')).toBe(true)
    // bar chart should contain block chars or the day labels in the output/reply
    expect(`${lastOutput}\n${reply}`).toMatch(/█|Mon|Thu/)
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
