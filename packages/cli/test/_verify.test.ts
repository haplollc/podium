// Verify showcase prompts against the real model. Run with PODIUM_LIVE=1.
import { describe, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OllamaProvider } from '@podium/providers'
import { ContextManager, buildSystemPrompt, runTurn } from '@podium/core'
import { allTools } from '@podium/tools'

const LIVE = process.env.PODIUM_LIVE === '1'
const MODEL = process.env.PODIUM_MODEL ?? 'qwen2.5-coder:14b'

// [label, prompt, successPredicate(allOutput)]
const CASES: Array<[string, string, (s: string) => boolean]> = [
  ['fizzbuzz+test', 'write fizzbuzz.py (1 to 30), run it, then add a unit test test_fizzbuzz.py and run the tests — show both outputs here.', s => /Fizz/i.test(s) && /Buzz/i.test(s)],
  ['wordcount', 'create a Python script wordcount.py that takes a file path, prints the top 5 most common words; generate a sample.txt with a paragraph, then run it on that file and show the result.', s => /\b\d+\b/.test(s) && /exit=0/.test(s)],
  ['bench', "write and run bench.py that times bubble sort vs Python's built-in sort on a list of 2000 random numbers and prints the speedup factor.", s => /speedup|faster|x\b|times/i.test(s) && /exit=0/.test(s)],
  ['calc-cli', 'create a small CLI calc.py supporting add/sub/mul/div via arguments (e.g. calc.py add 3 4), then run all four operations and show the outputs.', s => /\b7\b/.test(s) && /exit=0/.test(s)],
  ['mandelbrot', 'write a Python script that draws a Mandelbrot set as ASCII art in the terminal, run it, and show the result.', s => /exit=0/.test(s) && /[*#@.]{5,}|[\S]{20,}/.test(s)],
  ['json-filter', 'create data.json with 5 user records, then write and run a script that loads it, filters users over age 30, and prints their names sorted alphabetically.', s => /exit=0/.test(s)],
  ['todo-module+test', 'create a Python todo list module todo.py (add/list/done backed by a JSON file) AND a test file that exercises every command; run the tests and show they pass.', s => /pass|ok|PASSED|\d+ passed/i.test(s) && /exit=0/.test(s)],
  ['backup-sh', 'write a Bash script backup.sh that tars the current directory into a timestamped archive, make it executable, run it, and list the resulting file.', s => /\.tar/i.test(s) && /exit=0/.test(s)],
]

describe.skipIf(!LIVE)('verify showcase prompts', () => {
  for (const [label, prompt, ok] of CASES) {
    it(label, async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'v-'))
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
      const pass = ok(all)
      console.log(`VERDICT ${label}: ${pass ? 'PASS' : 'FAIL'}`)
      await rm(dir, { recursive: true, force: true })
    }, 180_000)
  }
})
