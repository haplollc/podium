// Live end-to-end test against a real Ollama model.
// Skipped by default; run with:  PODIUM_LIVE=1 pnpm vitest run packages/cli/test/live.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OllamaProvider } from '@podium/providers'
import { ContextManager, buildSystemPrompt, runTurn } from '@podium/core'
import { allTools } from '@podium/tools'

const LIVE = process.env.PODIUM_LIVE === '1'
const MODEL = process.env.PODIUM_MODEL ?? 'qwen2.5-coder:7b'

describe.skipIf(!LIVE)('live agent loop', () => {
  it('creates and reads a file via real tool calls', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-live-'))
    const provider = new OllamaProvider()
    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({
      role: 'user',
      content: 'Create a file named hello.txt containing exactly the word: podium. Then read it back to confirm. Keep going until the file exists and you have verified its contents.',
    })

    const tools = new Set<string>()
    const finalText = await runTurn({
      provider, model: MODEL, cm, tools: allTools,
      systemPrompt: buildSystemPrompt({ cwd: dir, os: process.platform, toolNames: allTools.map(t => t.schema.name) }),
      numCtx: 16384, cwd: dir,
      onToolStart: (call) => { tools.add(call.name); console.log(`[tool] ${call.name}(${JSON.stringify(call.arguments)})`) },
    })
    console.log(`[assistant] ${finalText}`)
    console.log(`[context] ${JSON.stringify(cm.stats())}`)

    const content = (await readFile(path.join(dir, 'hello.txt'), 'utf8')).trim()
    await rm(dir, { recursive: true, force: true })

    expect(content).toContain('podium')
    expect(tools.has('Write')).toBe(true)
  }, 180_000)
})
