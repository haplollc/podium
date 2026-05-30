import { describe, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OllamaProvider } from '@podium/providers'
import { ContextManager, buildSystemPrompt, runTurn } from '@podium/core'
import { allTools } from '@podium/tools'

const LIVE = process.env.PODIUM_LIVE === '1'
const MODEL = process.env.PODIUM_MODEL ?? 'qwen2.5-coder:14b'

const CASES: Array<[string, string, (s: string) => boolean]> = [
  ['static-site', 'build a tiny static site: index.html with a dark theme, a styles.css, and a script.js that shows a live clock; then list the files to confirm all three exist.', s => /index\.html/.test(s) && /styles\.css/.test(s) && /script\.js/.test(s)],
  ['todo-module-retry', 'create a Python todo list module todo.py (add/list/done backed by a JSON file) AND a test file that exercises every command; run the tests and show they pass.', s => /(pass|ok|PASSED|\d+ passed)/i.test(s) && /exit=0/.test(s)],
  ['comparison-md', 'research the difference between Ollama and llama.cpp, then write a concise comparison.md with a pros/cons table for each, and print the table here.', s => /ollama/i.test(s) && /llama\.cpp/i.test(s) && /\|/.test(s)],
  ['data-filter', 'create data.json with 5 user records, then write and run a script that loads it, filters users over age 30, and prints their names sorted alphabetically.', s => /exit=0/.test(s)],
]

describe.skipIf(!LIVE)('verify hard prompts', () => {
  for (const [label, prompt, ok] of CASES) {
    it(label, async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'v2-'))
      const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
      cm.add({ role: 'user', content: prompt })
      let all = ''
      const reply = await runTurn({
        provider: new OllamaProvider(), model: MODEL, cm, tools: allTools,
        systemPrompt: buildSystemPrompt({ cwd: dir, os: process.platform, toolNames: allTools.map(t => t.schema.name) }),
        numCtx: 16384, cwd: dir, keepAlive: '30m',
        onToolResult: (_c, r) => { all += '\n' + r },
      })
      all += '\n' + reply
      console.log(`VERDICT ${label}: ${ok(all) ? 'PASS' : 'FAIL'}`)
      await rm(dir, { recursive: true, force: true })
    }, 200_000)
  }
})
