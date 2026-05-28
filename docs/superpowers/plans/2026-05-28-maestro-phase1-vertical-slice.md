# Maestro Phase 1 (Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a runnable end-to-end local-model coding agent: detect hardware → pick/pull an Ollama model in a setup wizard → drop into a REPL → run an agentic tool loop (Read/Write/Edit/Bash/Grep/Glob) with a live context meter and basic auto-compaction.

**Architecture:** A pnpm/TypeScript monorepo. Pure-logic packages (`hardware`, `providers`, `core`, `tools`) are framework-free and unit-tested with Vitest. The `tui` package renders with Ink/React; the `cli` package wires everything together and persists config. Phase 1 targets the Ollama backend only (the `Provider` interface is built so LM Studio/MLX drop in during Phase 4).

**Tech Stack:** TypeScript 5.x (ESM), pnpm workspaces, Vitest, Ink + React (TUI), `fetch` (Ollama HTTP API), `tsx` (dev), `tsup` (bundling), `execa` (subprocess), Node ≥ 20.

---

## File Structure

```
maestro/
  package.json                      # root, pnpm workspace + scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts
  models/
    catalog.json                    # curated model -> quant -> size/capabilities
  packages/
    hardware/
      src/index.ts                  # public exports
      src/memory.ts                 # sysctl memory/chip detection
      src/fit.ts                    # model-fit calculator (verdict math)
      src/types.ts
      test/memory.test.ts
      test/fit.test.ts
    providers/
      src/index.ts
      src/types.ts                  # Provider interface + shared types
      src/ollama.ts                 # Ollama adapter
      src/catalog.ts                # load + query models/catalog.json
      test/ollama.test.ts
      test/catalog.test.ts
    core/
      src/index.ts
      src/tokens.ts                 # token estimator
      src/context.ts                # ContextManager (message store + meter)
      src/compaction.ts             # compaction trigger + summarizer prompt
      src/loop.ts                   # agentic loop (native tool calling)
      src/system-prompt.ts          # minimal system prompt assembly
      src/types.ts
      test/tokens.test.ts
      test/context.test.ts
      test/compaction.test.ts
      test/loop.test.ts
    tools/
      src/index.ts                  # registry + Tool interface
      src/read.ts src/write.ts src/edit.ts
      src/bash.ts src/grep.ts src/glob.ts
      src/truncate.ts               # shared output-capping helper
      src/types.ts
      test/*.test.ts
    tui/
      src/ContextMeter.tsx
      src/ModelPicker.tsx
      src/SetupWizard.tsx
      src/Repl.tsx
      src/index.ts
      test/ContextMeter.test.tsx
    cli/
      src/index.ts                  # `maestro` entrypoint
      src/config.ts                 # ~/.maestro/config.json load/save
      src/app.tsx                   # top-level Ink app (wizard-or-repl)
      bin/maestro.js                # shebang launcher
      test/config.test.ts
```

Each package builds independently and exports a small, typed public surface via `src/index.ts`.

---

## Task 0: Monorepo scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
coverage/
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "maestro-monorepo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "@types/node": "^20.16.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "lib": ["ES2022"]
  }
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 6: Install and verify**

Run: `pnpm install && pnpm vitest run`
Expected: install succeeds; vitest reports "No test files found" (exit 0) — no tests yet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm/TypeScript monorepo with Vitest"
```

---

## Task 1: `hardware` — memory & chip detection

**Files:**
- Create: `packages/hardware/package.json`, `packages/hardware/tsconfig.json`, `packages/hardware/src/types.ts`, `packages/hardware/src/memory.ts`, `packages/hardware/src/index.ts`
- Test: `packages/hardware/test/memory.test.ts`

- [ ] **Step 1: Create `packages/hardware/package.json`**

```json
{
  "name": "@maestro/hardware",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts" }
}
```

- [ ] **Step 2: Create `packages/hardware/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Create `packages/hardware/src/types.ts`**

```ts
export interface SystemInfo {
  totalMemoryBytes: number
  totalMemoryGB: number      // rounded to 1 decimal
  usableMemoryGB: number     // 0.7 * total, the budget for weights+KV
  chip: string               // e.g. "Apple M2"
  arch: string               // e.g. "arm64"
  cpuCores: number
}
```

- [ ] **Step 4: Write the failing test `packages/hardware/test/memory.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { computeSystemInfo } from '../src/memory.js'

describe('computeSystemInfo', () => {
  it('derives GB and usable memory from a sysctl runner', async () => {
    const fakeSysctl = vi.fn(async (key: string) => {
      const map: Record<string, string> = {
        'hw.memsize': '25769803776',          // 24 GiB
        'machdep.cpu.brand_string': 'Apple M2',
        'hw.ncpu': '8',
      }
      return map[key] ?? ''
    })
    const info = await computeSystemInfo({ sysctl: fakeSysctl, arch: 'arm64' })
    expect(info.totalMemoryGB).toBe(24)
    expect(info.usableMemoryGB).toBeCloseTo(16.8, 1) // 0.7 * 24
    expect(info.chip).toBe('Apple M2')
    expect(info.cpuCores).toBe(8)
    expect(info.arch).toBe('arm64')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm vitest run packages/hardware/test/memory.test.ts`
Expected: FAIL — cannot find module `../src/memory.js`.

- [ ] **Step 6: Implement `packages/hardware/src/memory.ts`**

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { SystemInfo } from './types.js'

const pExecFile = promisify(execFile)

export type SysctlRunner = (key: string) => Promise<string>

const realSysctl: SysctlRunner = async (key) => {
  const { stdout } = await pExecFile('sysctl', ['-n', key])
  return stdout.trim()
}

export interface ComputeOpts {
  sysctl?: SysctlRunner
  arch?: string
}

export async function computeSystemInfo(opts: ComputeOpts = {}): Promise<SystemInfo> {
  const sysctl = opts.sysctl ?? realSysctl
  const arch = opts.arch ?? os.arch()
  const [memStr, chip, ncpu] = await Promise.all([
    sysctl('hw.memsize'),
    sysctl('machdep.cpu.brand_string'),
    sysctl('hw.ncpu'),
  ])
  const totalMemoryBytes = Number(memStr) || 0
  const totalMemoryGB = Math.round(totalMemoryBytes / 1024 ** 3)
  const usableMemoryGB = Math.round(totalMemoryGB * 0.7 * 10) / 10
  return {
    totalMemoryBytes,
    totalMemoryGB,
    usableMemoryGB,
    chip: chip || 'Unknown',
    arch,
    cpuCores: Number(ncpu) || os.cpus().length,
  }
}
```

- [ ] **Step 7: Create `packages/hardware/src/index.ts`**

```ts
export * from './types.js'
export { computeSystemInfo } from './memory.js'
export type { SysctlRunner, ComputeOpts } from './memory.js'
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run packages/hardware/test/memory.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(hardware): detect memory, chip, and usable-memory budget"
```

---

## Task 2: `hardware` — model-fit calculator

**Files:**
- Create: `packages/hardware/src/fit.ts`
- Modify: `packages/hardware/src/index.ts`
- Test: `packages/hardware/test/fit.test.ts`

- [ ] **Step 1: Write the failing test `packages/hardware/test/fit.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { estimateFit } from '../src/fit.js'
import type { SystemInfo } from '../src/types.js'

const sys24: SystemInfo = {
  totalMemoryBytes: 24 * 1024 ** 3, totalMemoryGB: 24, usableMemoryGB: 16.8,
  chip: 'Apple M2', arch: 'arm64', cpuCores: 8,
}

describe('estimateFit', () => {
  it('marks a 7B Q4 model as a green fit on 24GB', () => {
    const r = estimateFit({ weightsGB: 4.7, contextTokens: 8192, kvPerKTokenGB: 0.12 }, sys24)
    expect(r.requiredGB).toBeGreaterThan(4.7)   // weights + kv + overhead
    expect(r.verdict).toBe('fits')
  })

  it('marks a 70B Q4 model as wont-run on 24GB', () => {
    const r = estimateFit({ weightsGB: 42, contextTokens: 8192, kvPerKTokenGB: 0.5 }, sys24)
    expect(r.verdict).toBe('wont-run')
  })

  it('marks a borderline model as tight', () => {
    // weights 13 + kv(8k*0.18=1.47) + overhead 2 = ~16.5 vs 16.8 usable
    const r = estimateFit({ weightsGB: 13, contextTokens: 8192, kvPerKTokenGB: 0.18, overheadGB: 2 }, sys24)
    expect(r.verdict).toBe('tight')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/hardware/test/fit.test.ts`
Expected: FAIL — cannot find module `../src/fit.js`.

- [ ] **Step 3: Implement `packages/hardware/src/fit.ts`**

```ts
import type { SystemInfo } from './types.js'

export type FitVerdict = 'fits' | 'tight' | 'wont-run'

export interface ModelFootprint {
  weightsGB: number
  contextTokens: number
  kvPerKTokenGB: number     // KV-cache GB per 1k tokens of context
  overheadGB?: number       // OS + runtime overhead; default 2
}

export interface FitResult {
  requiredGB: number
  usableGB: number
  verdict: FitVerdict
  headroomGB: number        // usable - required (negative => over budget)
}

export function estimateFit(m: ModelFootprint, sys: SystemInfo): FitResult {
  const overhead = m.overheadGB ?? 2
  const kv = (m.contextTokens / 1000) * m.kvPerKTokenGB
  const requiredGB = Math.round((m.weightsGB + kv + overhead) * 10) / 10
  const usableGB = sys.usableMemoryGB
  const headroomGB = Math.round((usableGB - requiredGB) * 10) / 10
  let verdict: FitVerdict
  if (requiredGB <= usableGB * 0.9) verdict = 'fits'
  else if (requiredGB <= usableGB) verdict = 'tight'
  else verdict = 'wont-run'
  return { requiredGB, usableGB, verdict, headroomGB }
}
```

- [ ] **Step 4: Modify `packages/hardware/src/index.ts` to export fit**

Add after the existing exports:

```ts
export { estimateFit } from './fit.js'
export type { FitVerdict, ModelFootprint, FitResult } from './fit.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/hardware/test/fit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(hardware): model-fit calculator with fits/tight/wont-run verdict"
```

---

## Task 3: Model catalog data + loader

**Files:**
- Create: `models/catalog.json`, `packages/providers/package.json`, `packages/providers/tsconfig.json`, `packages/providers/src/catalog.ts`, `packages/providers/src/index.ts`
- Test: `packages/providers/test/catalog.test.ts`

- [ ] **Step 1: Create `models/catalog.json`**

```json
{
  "models": [
    { "id": "qwen2.5-coder:3b", "label": "Qwen2.5-Coder 3B", "params": "3B",
      "quant": "Q4_K_M", "weightsGB": 2.0, "kvPerKTokenGB": 0.06, "defaultContext": 8192,
      "tools": true, "minTierGB": 8, "recommendedForGB": [8] },
    { "id": "qwen2.5-coder:7b", "label": "Qwen2.5-Coder 7B", "params": "7B",
      "quant": "Q4_K_M", "weightsGB": 4.7, "kvPerKTokenGB": 0.12, "defaultContext": 16384,
      "tools": true, "minTierGB": 16, "recommendedForGB": [16] },
    { "id": "qwen2.5-coder:14b", "label": "Qwen2.5-Coder 14B", "params": "14B",
      "quant": "Q4_K_M", "weightsGB": 9.0, "kvPerKTokenGB": 0.16, "defaultContext": 16384,
      "tools": true, "minTierGB": 24, "recommendedForGB": [24] },
    { "id": "gpt-oss:20b", "label": "gpt-oss 20B", "params": "20B",
      "quant": "Q4", "weightsGB": 12.0, "kvPerKTokenGB": 0.18, "defaultContext": 16384,
      "tools": true, "minTierGB": 24, "recommendedForGB": [24, 32] },
    { "id": "qwen3-coder:30b", "label": "Qwen3-Coder 30B (MoE)", "params": "30B-A3B",
      "quant": "Q4_K_M", "weightsGB": 18.0, "kvPerKTokenGB": 0.20, "defaultContext": 32768,
      "tools": true, "minTierGB": 32, "recommendedForGB": [32] }
  ]
}
```

- [ ] **Step 2: Create `packages/providers/package.json`**

```json
{
  "name": "@maestro/providers",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts" },
  "dependencies": { "@maestro/hardware": "workspace:*" }
}
```

- [ ] **Step 3: Create `packages/providers/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 4: Write the failing test `packages/providers/test/catalog.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { loadCatalog, recommendedFor } from '../src/catalog.js'

describe('catalog', () => {
  it('loads all models from catalog.json', async () => {
    const cat = await loadCatalog()
    expect(cat.length).toBeGreaterThanOrEqual(5)
    expect(cat.find(m => m.id === 'qwen2.5-coder:7b')).toBeTruthy()
  })

  it('recommends the 7B model for a 16GB machine', async () => {
    const cat = await loadCatalog()
    const rec = recommendedFor(cat, 16)
    expect(rec?.id).toBe('qwen2.5-coder:7b')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm vitest run packages/providers/test/catalog.test.ts`
Expected: FAIL — cannot find module `../src/catalog.js`.

- [ ] **Step 6: Implement `packages/providers/src/catalog.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export interface CatalogModel {
  id: string
  label: string
  params: string
  quant: string
  weightsGB: number
  kvPerKTokenGB: number
  defaultContext: number
  tools: boolean
  minTierGB: number
  recommendedForGB: number[]
}

// models/catalog.json lives at the repo root, two levels up from dist/.
function catalogPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../../models/catalog.json')
}

export async function loadCatalog(p = catalogPath()): Promise<CatalogModel[]> {
  const raw = await readFile(p, 'utf8')
  return JSON.parse(raw).models as CatalogModel[]
}

/** Best recommended model whose recommendedForGB includes this tier, else the
 *  largest model whose minTierGB <= memoryGB. */
export function recommendedFor(cat: CatalogModel[], memoryGB: number): CatalogModel | undefined {
  const exact = cat.find(m => m.recommendedForGB.includes(memoryGB))
  if (exact) return exact
  const eligible = cat.filter(m => m.minTierGB <= memoryGB).sort((a, b) => b.weightsGB - a.weightsGB)
  return eligible[0]
}
```

- [ ] **Step 7: Create `packages/providers/src/index.ts`**

```ts
export { loadCatalog, recommendedFor } from './catalog.js'
export type { CatalogModel } from './catalog.js'
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run packages/providers/test/catalog.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(providers): model catalog data + loader with per-tier recommendation"
```

---

## Task 4: `Provider` interface + Ollama adapter

**Files:**
- Create: `packages/providers/src/types.ts`, `packages/providers/src/ollama.ts`
- Modify: `packages/providers/src/index.ts`
- Test: `packages/providers/test/ollama.test.ts`

- [ ] **Step 1: Create `packages/providers/src/types.ts`**

```ts
export interface LocalModel { name: string; sizeBytes: number }
export interface PullProgress { status: string; completed?: number; total?: number }
export interface ModelCapabilities { tools: boolean; contextLength?: number }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  tools?: ToolSchema[]
  numCtx?: number
  temperature?: number
}

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done' }

export interface HealthStatus { running: boolean; detail?: string }

export interface Provider {
  id: 'ollama' | 'lmstudio' | 'mlx'
  health(): Promise<HealthStatus>
  listLocal(): Promise<LocalModel[]>
  pull(model: string, onProgress: (p: PullProgress) => void): Promise<void>
  capabilities(model: string): Promise<ModelCapabilities>
  chat(req: ChatRequest): AsyncIterable<ChatEvent>
}
```

- [ ] **Step 2: Write the failing test `packages/providers/test/ollama.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OllamaProvider } from '../src/ollama.js'

function jsonResponse(obj: unknown) {
  return new Response(JSON.stringify(obj), { status: 200 })
}

describe('OllamaProvider', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('health() returns running:true when /api/tags responds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ models: [] })))
    const p = new OllamaProvider()
    expect((await p.health()).running).toBe(true)
  })

  it('listLocal() maps /api/tags into LocalModel[]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ models: [{ name: 'qwen2.5-coder:7b', size: 4700000000 }] })))
    const p = new OllamaProvider()
    const models = await p.listLocal()
    expect(models).toEqual([{ name: 'qwen2.5-coder:7b', sizeBytes: 4700000000 }])
  })

  it('capabilities() reads the capabilities array from /api/show', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ capabilities: ['completion', 'tools'], model_info: { 'general.context_length': 32768 } })))
    const p = new OllamaProvider()
    const caps = await p.capabilities('qwen2.5-coder:7b')
    expect(caps.tools).toBe(true)
    expect(caps.contextLength).toBe(32768)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/providers/test/ollama.test.ts`
Expected: FAIL — cannot find module `../src/ollama.js`.

- [ ] **Step 4: Implement `packages/providers/src/ollama.ts`**

```ts
import type {
  Provider, HealthStatus, LocalModel, PullProgress, ModelCapabilities,
  ChatRequest, ChatEvent, ToolCall,
} from './types.js'

export class OllamaProvider implements Provider {
  readonly id = 'ollama' as const
  constructor(private base = process.env.OLLAMA_HOST ?? 'http://localhost:11434') {}

  async health(): Promise<HealthStatus> {
    try {
      const r = await fetch(`${this.base}/api/tags`)
      return { running: r.ok }
    } catch (e) {
      return { running: false, detail: (e as Error).message }
    }
  }

  async listLocal(): Promise<LocalModel[]> {
    const r = await fetch(`${this.base}/api/tags`)
    const data = await r.json() as { models?: { name: string; size: number }[] }
    return (data.models ?? []).map(m => ({ name: m.name, sizeBytes: m.size }))
  }

  async pull(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
    const r = await fetch(`${this.base}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    })
    if (!r.body) throw new Error('no response body from /api/pull')
    for await (const line of readNdjson(r.body)) {
      onProgress(line as PullProgress)
    }
  }

  async capabilities(model: string): Promise<ModelCapabilities> {
    const r = await fetch(`${this.base}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    const data = await r.json() as { capabilities?: string[]; model_info?: Record<string, number> }
    const ctxKey = Object.keys(data.model_info ?? {}).find(k => k.endsWith('context_length'))
    return {
      tools: (data.capabilities ?? []).includes('tools'),
      contextLength: ctxKey ? data.model_info![ctxKey] : undefined,
    }
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const r = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map(m => ({
          role: m.role, content: m.content,
          tool_calls: m.tool_calls?.map(tc => ({ function: { name: tc.name, arguments: tc.arguments } })),
        })),
        tools: req.tools?.map(t => ({ type: 'function', function: t })),
        stream: true,
        options: { num_ctx: req.numCtx, temperature: req.temperature ?? 0.2 },
      }),
    })
    if (!r.body) throw new Error('no response body from /api/chat')
    for await (const chunk of readNdjson(r.body)) {
      const c = chunk as {
        message?: { content?: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] }
        done?: boolean
      }
      if (c.message?.content) yield { type: 'text', delta: c.message.content }
      for (const tc of c.message?.tool_calls ?? []) {
        const call: ToolCall = {
          id: `call_${tc.function.name}_${Math.abs(hash(JSON.stringify(tc.function.arguments)))}`,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }
        yield { type: 'tool_call', call }
      }
      if (c.done) yield { type: 'done' }
    }
  }
}

// Deterministic id helper (no Math.random for reproducibility).
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buf.trim()) yield JSON.parse(buf.trim())
}
```

- [ ] **Step 5: Modify `packages/providers/src/index.ts`**

Replace its contents with:

```ts
export { loadCatalog, recommendedFor } from './catalog.js'
export type { CatalogModel } from './catalog.js'
export { OllamaProvider } from './ollama.js'
export type {
  Provider, LocalModel, PullProgress, ModelCapabilities, ChatMessage,
  ToolCall, ToolSchema, ChatRequest, ChatEvent, HealthStatus,
} from './types.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/providers/test/ollama.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(providers): Provider interface + Ollama adapter (health/list/pull/caps/chat)"
```

---

## Task 5: `core` — token estimator

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/tokens.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/tokens.test.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@maestro/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts" },
  "dependencies": { "@maestro/providers": "workspace:*" }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Write the failing test `packages/core/test/tokens.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateMessageTokens } from '../src/tokens.js'

describe('token estimator', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('a'.repeat(40))).toBe(10)
  })
  it('adds per-message overhead', () => {
    const t = estimateMessageTokens([{ role: 'user', content: 'hello world' }])
    expect(t).toBeGreaterThan(estimateTokens('hello world'))
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/tokens.test.ts`
Expected: FAIL — cannot find module `../src/tokens.js`.

- [ ] **Step 5: Implement `packages/core/src/tokens.ts`**

```ts
import type { ChatMessage } from '@maestro/providers'

const CHARS_PER_TOKEN = 4
const PER_MESSAGE_OVERHEAD = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += PER_MESSAGE_OVERHEAD + estimateTokens(m.content)
    for (const tc of m.tool_calls ?? []) {
      total += estimateTokens(tc.name + JSON.stringify(tc.arguments))
    }
  }
  return total
}
```

- [ ] **Step 6: Create `packages/core/src/index.ts`**

```ts
export { estimateTokens, estimateMessageTokens } from './tokens.js'
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/tokens.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): heuristic token estimator for messages and tool calls"
```

---

## Task 6: `core` — ContextManager (message store + meter)

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/context.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/context.test.ts`

- [ ] **Step 1: Create `packages/core/src/types.ts`**

```ts
export interface ContextStats {
  used: number          // estimated tokens currently in context
  effective: number     // usable window after output reserve
  window: number        // model context window
  percentUsed: number   // 0..1 of effective
}
```

- [ ] **Step 2: Write the failing test `packages/core/test/context.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { ContextManager } from '../src/context.js'

describe('ContextManager', () => {
  it('tracks messages and reports stats against the effective window', () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'x'.repeat(4000) }) // ~1000 tokens
    const s = cm.stats()
    expect(s.window).toBe(8192)
    expect(s.effective).toBe(6192)            // 8192 - 2000
    expect(s.used).toBeGreaterThan(900)
    expect(s.percentUsed).toBeCloseTo(s.used / s.effective, 5)
  })

  it('replaceWithSummary swaps the message list for a summary message', () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'a'.repeat(8000) })
    cm.add({ role: 'assistant', content: 'b'.repeat(8000) })
    const before = cm.stats().used
    cm.replaceWithSummary('short summary', 1) // keep first 1 message as prefix
    expect(cm.messages().length).toBe(2)      // retained prefix + summary
    expect(cm.stats().used).toBeLessThan(before)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/context.test.ts`
Expected: FAIL — cannot find module `../src/context.js`.

- [ ] **Step 4: Implement `packages/core/src/context.ts`**

```ts
import type { ChatMessage } from '@maestro/providers'
import { estimateMessageTokens } from './tokens.js'
import type { ContextStats } from './types.js'

export interface ContextOpts { window: number; outputReserve: number }

export class ContextManager {
  private msgs: ChatMessage[] = []
  constructor(private opts: ContextOpts) {}

  add(m: ChatMessage): void { this.msgs.push(m) }
  messages(): ChatMessage[] { return this.msgs }

  stats(): ContextStats {
    const used = estimateMessageTokens(this.msgs)
    const effective = this.opts.window - this.opts.outputReserve
    return {
      used,
      effective,
      window: this.opts.window,
      percentUsed: effective > 0 ? used / effective : 1,
    }
  }

  /** Keep the first `prefixCount` messages, replace the rest with one summary. */
  replaceWithSummary(summary: string, prefixCount: number): void {
    const prefix = this.msgs.slice(0, prefixCount)
    this.msgs = [
      ...prefix,
      { role: 'user', content: `[Earlier conversation summarized]\n${summary}` },
    ]
  }
}
```

- [ ] **Step 5: Modify `packages/core/src/index.ts`**

Append:

```ts
export { ContextManager } from './context.js'
export type { ContextOpts } from './context.js'
export type { ContextStats } from './types.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/context.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): ContextManager with token stats and summary replacement"
```

---

## Task 7: `core` — compaction trigger + summarizer

**Files:**
- Create: `packages/core/src/compaction.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/compaction.test.ts`

- [ ] **Step 1: Write the failing test `packages/core/test/compaction.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { shouldCompact, compact, SUMMARY_PROMPT } from '../src/compaction.js'
import { ContextManager } from '../src/context.js'

describe('compaction', () => {
  it('shouldCompact is true once used crosses effective - buffer', () => {
    expect(shouldCompact({ used: 5000, effective: 6000, window: 8192, percentUsed: 0.83 }, 1500)).toBe(true)
    expect(shouldCompact({ used: 3000, effective: 6000, window: 8192, percentUsed: 0.5 }, 1500)).toBe(false)
  })

  it('compact() summarizes the tail and shrinks context', async () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'task: build X' })
    cm.add({ role: 'assistant', content: 'z'.repeat(12000) })
    cm.add({ role: 'user', content: 'w'.repeat(12000) })
    const before = cm.stats().used
    const fakeSummarize = vi.fn(async () => 'SUMMARY: building X, did stuff')
    await compact(cm, { summarize: fakeSummarize, prefixCount: 1 })
    expect(fakeSummarize).toHaveBeenCalledOnce()
    // The prompt passed to summarize includes the summary instruction.
    expect(fakeSummarize.mock.calls[0][0]).toContain(SUMMARY_PROMPT.slice(0, 20))
    expect(cm.stats().used).toBeLessThan(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/compaction.test.ts`
Expected: FAIL — cannot find module `../src/compaction.js`.

- [ ] **Step 3: Implement `packages/core/src/compaction.ts`**

```ts
import type { ChatMessage } from '@maestro/providers'
import type { ContextStats } from './types.js'
import type { ContextManager } from './context.js'

export const SUMMARY_PROMPT = `Summarize the conversation below so work can continue with the detail intact. Use these sections:
1. Task — what the user is trying to accomplish.
2. Current state — what has been done so far.
3. Files & code — files touched and key snippets, with why.
4. Decisions — important choices made.
5. Next steps — the immediate next action.
Be concise but preserve technical specifics. Output only the summary.`

/** Trigger when used tokens are within `buffer` of the effective window. */
export function shouldCompact(stats: ContextStats, buffer: number): boolean {
  return stats.used >= stats.effective - buffer
}

export interface CompactOpts {
  /** Calls the model with a prompt, returns the summary text. */
  summarize: (prompt: string) => Promise<string>
  /** Number of leading messages to retain verbatim (e.g. the original task). */
  prefixCount: number
}

export async function compact(cm: ContextManager, opts: CompactOpts): Promise<void> {
  const tail = cm.messages().slice(opts.prefixCount)
  const transcript = tail.map(renderMessage).join('\n\n')
  const summary = await opts.summarize(`${SUMMARY_PROMPT}\n\n---\n${transcript}`)
  cm.replaceWithSummary(summary, opts.prefixCount)
}

function renderMessage(m: ChatMessage): string {
  const calls = m.tool_calls?.map(tc => `\n  -> ${tc.name}(${JSON.stringify(tc.arguments)})`).join('') ?? ''
  return `[${m.role}] ${m.content}${calls}`
}
```

- [ ] **Step 4: Modify `packages/core/src/index.ts`**

Append:

```ts
export { shouldCompact, compact, SUMMARY_PROMPT } from './compaction.js'
export type { CompactOpts } from './compaction.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/compaction.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): auto-compaction trigger + retained-prefix tail summarizer"
```

---

## Task 8: `core` — minimal system prompt

**Files:**
- Create: `packages/core/src/system-prompt.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/loop.test.ts` (shared with Task 9; create here)

- [ ] **Step 1: Write the failing test (system-prompt portion) `packages/core/test/loop.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../src/system-prompt.js'

describe('buildSystemPrompt', () => {
  it('is compact (<1200 tokens worth of chars) and includes cwd + tool discipline', () => {
    const p = buildSystemPrompt({ cwd: '/work/proj', os: 'darwin', toolNames: ['Read', 'Edit', 'Bash'] })
    expect(p).toContain('/work/proj')
    expect(p.toLowerCase()).toContain('read')
    expect(p.length).toBeLessThan(4800) // ~1200 tokens at 4 chars/token
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/loop.test.ts`
Expected: FAIL — cannot find module `../src/system-prompt.js`.

- [ ] **Step 3: Implement `packages/core/src/system-prompt.ts`**

```ts
export interface SystemPromptCtx {
  cwd: string
  os: string
  toolNames: string[]
}

export function buildSystemPrompt(ctx: SystemPromptCtx): string {
  return [
    `You are Maestro, a terminal coding agent running on a local model.`,
    `Help with software tasks. Be concise; prefer doing over explaining.`,
    `Use the provided tools to read and change files and run commands. Prefer dedicated tools (Read/Edit/Grep/Glob) over shell equivalents (cat/sed/grep/find).`,
    `You MUST Read a file before you Write or Edit it. Make the smallest change that satisfies the request.`,
    `Call tools when you need to act. When the task is done, reply with a short result — no tool call.`,
    `Available tools: ${ctx.toolNames.join(', ')}.`,
    `Environment: cwd=${ctx.cwd}, os=${ctx.os}.`,
  ].join('\n')
}
```

- [ ] **Step 4: Modify `packages/core/src/index.ts`**

Append:

```ts
export { buildSystemPrompt } from './system-prompt.js'
export type { SystemPromptCtx } from './system-prompt.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/loop.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): minimal (<1k token) system prompt assembly"
```

---

## Task 9: `tools` — shared truncation + Tool interface

**Files:**
- Create: `packages/tools/package.json`, `packages/tools/tsconfig.json`, `packages/tools/src/types.ts`, `packages/tools/src/truncate.ts`, `packages/tools/src/index.ts`
- Test: `packages/tools/test/truncate.test.ts`

- [ ] **Step 1: Create `packages/tools/package.json`**

```json
{
  "name": "@maestro/tools",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts" },
  "dependencies": { "execa": "^9.4.0", "@maestro/providers": "workspace:*" }
}
```

- [ ] **Step 2: Create `packages/tools/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Create `packages/tools/src/types.ts`**

```ts
import type { ToolSchema } from '@maestro/providers'

export interface ToolContext { cwd: string }

export interface Tool {
  schema: ToolSchema
  /** Returns a string result that is appended to the conversation as a tool message. */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>
}
```

- [ ] **Step 4: Write the failing test `packages/tools/test/truncate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { truncateLines } from '../src/truncate.js'

describe('truncateLines', () => {
  it('caps output and appends a remaining-lines marker', () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const out = truncateLines(text, 10)
    expect(out.split('\n').length).toBeLessThanOrEqual(11) // 10 + marker
    expect(out).toContain('90 more lines')
  })
  it('returns input unchanged when under the cap', () => {
    expect(truncateLines('a\nb', 10)).toBe('a\nb')
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm vitest run packages/tools/test/truncate.test.ts`
Expected: FAIL — cannot find module `../src/truncate.js`.

- [ ] **Step 6: Implement `packages/tools/src/truncate.ts`**

```ts
export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  const kept = lines.slice(0, maxLines)
  const remaining = lines.length - maxLines
  return `${kept.join('\n')}\n… ${remaining} more lines (truncated)`
}
```

- [ ] **Step 7: Create `packages/tools/src/index.ts` (stub, expanded in later tasks)**

```ts
export { truncateLines } from './truncate.js'
export type { Tool, ToolContext } from './types.js'
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run packages/tools/test/truncate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(tools): Tool interface + shared output truncation helper"
```

---

## Task 10: `tools` — Read, Write, Edit

**Files:**
- Create: `packages/tools/src/read.ts`, `packages/tools/src/write.ts`, `packages/tools/src/edit.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/test/fileops.test.ts`

- [ ] **Step 1: Write the failing test `packages/tools/test/fileops.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/tools/test/fileops.test.ts`
Expected: FAIL — cannot find module `../src/read.js`.

- [ ] **Step 3: Implement `packages/tools/src/read.ts`**

```ts
import { readFile } from 'node:fs/promises'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

const DEFAULT_MAX_LINES = 250 // small-context default

export const readTool: Tool = {
  schema: {
    name: 'Read',
    description: 'Read a file from disk. Returns line-numbered content. Use an absolute path.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        max_lines: { type: 'number', description: `Max lines (default ${DEFAULT_MAX_LINES})` },
      },
      required: ['file_path'],
    },
  },
  async run(args) {
    const file = String(args.file_path)
    const max = Number(args.max_lines ?? DEFAULT_MAX_LINES)
    const raw = await readFile(file, 'utf8')
    const numbered = raw.split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n')
    return truncateLines(numbered, max)
  },
}
```

- [ ] **Step 4: Implement `packages/tools/src/write.ts`**

```ts
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Tool } from './types.js'

export const writeTool: Tool = {
  schema: {
    name: 'Write',
    description: 'Write content to a file, overwriting it. Read the file first if it already exists.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['file_path', 'content'],
    },
  },
  async run(args) {
    const file = String(args.file_path)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, String(args.content))
    return `Wrote ${String(args.content).length} bytes to ${file}`
  },
}
```

- [ ] **Step 5: Implement `packages/tools/src/edit.ts`**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import type { Tool } from './types.js'

export const editTool: Tool = {
  schema: {
    name: 'Edit',
    description: 'Replace an exact unique string in a file. old_string must appear exactly once unless replace_all is true.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  async run(args) {
    const file = String(args.file_path)
    const oldS = String(args.old_string)
    const newS = String(args.new_string)
    const replaceAll = Boolean(args.replace_all)
    const content = await readFile(file, 'utf8')
    const count = content.split(oldS).length - 1
    if (count === 0) throw new Error(`old_string not found in ${file}`)
    if (count > 1 && !replaceAll) throw new Error(`old_string is not unique (${count} matches); pass replace_all or add context`)
    const updated = replaceAll ? content.split(oldS).join(newS) : content.replace(oldS, newS)
    await writeFile(file, updated)
    return `Edited ${file} (${replaceAll ? count : 1} replacement${replaceAll && count > 1 ? 's' : ''})`
  },
}
```

- [ ] **Step 6: Modify `packages/tools/src/index.ts`**

Append:

```ts
export { readTool } from './read.js'
export { writeTool } from './write.js'
export { editTool } from './edit.js'
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run packages/tools/test/fileops.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(tools): Read (line-numbered+capped), Write, Edit (uniqueness-checked)"
```

---

## Task 11: `tools` — Bash, Grep, Glob + registry

**Files:**
- Create: `packages/tools/src/bash.ts`, `packages/tools/src/grep.ts`, `packages/tools/src/glob.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/test/shellops.test.ts`

- [ ] **Step 1: Write the failing test `packages/tools/test/shellops.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bashTool } from '../src/bash.js'
import { grepTool } from '../src/grep.js'
import { globTool } from '../src/glob.js'
import { allTools } from '../src/index.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'maestro-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('shell tools', () => {
  it('bash runs a command in cwd', async () => {
    const out = await bashTool.run({ command: 'echo hi' }, { cwd: dir })
    expect(out).toContain('hi')
  })
  it('grep finds matching lines', async () => {
    await writeFile(path.join(dir, 'f.ts'), 'const needle = 1\nconst other = 2')
    const out = await grepTool.run({ pattern: 'needle' }, { cwd: dir })
    expect(out).toContain('needle')
  })
  it('glob lists matching files', async () => {
    await writeFile(path.join(dir, 'a.ts'), '')
    await writeFile(path.join(dir, 'b.js'), '')
    const out = await globTool.run({ pattern: '**/*.ts' }, { cwd: dir })
    expect(out).toContain('a.ts')
    expect(out).not.toContain('b.js')
  })
  it('allTools exposes the six core tools', () => {
    const names = allTools.map(t => t.schema.name).sort()
    expect(names).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/tools/test/shellops.test.ts`
Expected: FAIL — cannot find module `../src/bash.js`.

- [ ] **Step 3: Implement `packages/tools/src/bash.ts`**

```ts
import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const bashTool: Tool = {
  schema: {
    name: 'Bash',
    description: 'Run a shell command in the working directory. Avoid cat/grep/find/sed — use Read/Grep/Glob/Edit instead.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_ms: { type: 'number', description: 'Default 120000' },
      },
      required: ['command'],
    },
  },
  async run(args, ctx) {
    const result = await execa(String(args.command), {
      shell: true, cwd: ctx.cwd, timeout: Number(args.timeout_ms ?? 120000),
      reject: false, all: true,
    })
    const body = result.all ?? `${result.stdout}\n${result.stderr}`
    return truncateLines(`exit=${result.exitCode}\n${body}`, 200)
  },
}
```

- [ ] **Step 4: Implement `packages/tools/src/grep.ts`**

```ts
import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const grepTool: Tool = {
  schema: {
    name: 'Grep',
    description: 'Search file contents with a regex (ripgrep). Returns matching lines with file:line.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Dir or file to search; defaults to cwd' },
        glob: { type: 'string', description: 'Optional file glob filter, e.g. *.ts' },
      },
      required: ['pattern'],
    },
  },
  async run(args, ctx) {
    const rgArgs = ['-n', String(args.pattern)]
    if (args.glob) rgArgs.push('-g', String(args.glob))
    rgArgs.push(args.path ? String(args.path) : '.')
    // Fall back to grep -rn if rg is unavailable.
    const bin = (await which('rg')) ? 'rg' : 'grep'
    if (bin === 'grep') rgArgs.unshift('-r')
    const r = await execa(bin, rgArgs, { cwd: ctx.cwd, reject: false })
    return truncateLines(r.stdout || '(no matches)', 100)
  },
}

async function which(cmd: string): Promise<boolean> {
  const r = await execa('which', [cmd], { reject: false })
  return r.exitCode === 0
}
```

- [ ] **Step 5: Implement `packages/tools/src/glob.ts`**

```ts
import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const globTool: Tool = {
  schema: {
    name: 'Glob',
    description: 'List files matching a glob pattern (e.g. **/*.ts), sorted by name.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Base dir; defaults to cwd' },
      },
      required: ['pattern'],
    },
  },
  async run(args, ctx) {
    // Use bash globstar to avoid an extra dependency.
    const base = args.path ? String(args.path) : '.'
    const cmd = `shopt -s globstar nullglob; for f in ${base}/${String(args.pattern)}; do echo "$f"; done`
    const r = await execa(cmd, { shell: '/bin/bash', cwd: ctx.cwd, reject: false })
    const files = r.stdout.split('\n').filter(Boolean).sort()
    return truncateLines(files.join('\n') || '(no matches)', 200)
  },
}
```

- [ ] **Step 6: Modify `packages/tools/src/index.ts` to export tools + registry**

Append:

```ts
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import type { Tool } from './types.js'

export { bashTool } from './bash.js'
export { grepTool } from './grep.js'
export { globTool } from './glob.js'

export const allTools: Tool[] = [readTool, writeTool, editTool, bashTool, grepTool, globTool]

export function toolByName(name: string): Tool | undefined {
  return allTools.find(t => t.schema.name === name)
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run packages/tools/test/shellops.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(tools): Bash, Grep, Glob + tool registry (allTools/toolByName)"
```

---

## Task 12: `core` — agentic loop (native tool calling + auto-compaction)

**Files:**
- Create: `packages/core/src/loop.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json` (add `@maestro/tools` dep)
- Test: `packages/core/test/loop.test.ts` (extend the file from Task 8)

- [ ] **Step 1: Add `@maestro/tools` to `packages/core/package.json` dependencies**

```json
"dependencies": { "@maestro/providers": "workspace:*", "@maestro/tools": "workspace:*" }
```

- [ ] **Step 2: Extend `packages/core/test/loop.test.ts` with the loop test**

Append to the existing file:

```ts
import { runTurn } from '../src/loop.js'
import { ContextManager } from '../src/context.js'
import type { Provider, ChatEvent } from '@maestro/providers'
import type { Tool } from '@maestro/tools'

function fakeProvider(scripts: ChatEvent[][]): Provider {
  let turn = 0
  return {
    id: 'ollama',
    health: async () => ({ running: true }),
    listLocal: async () => [],
    pull: async () => {},
    capabilities: async () => ({ tools: true }),
    async *chat() { for (const e of scripts[turn++]) yield e },
  }
}

describe('runTurn', () => {
  it('executes a tool call then returns the final assistant text', async () => {
    const calls: string[] = []
    const echoTool: Tool = {
      schema: { name: 'Echo', description: 'echo', parameters: { type: 'object', properties: {} } },
      run: async (a) => { calls.push(String(a.value)); return `echoed ${a.value}` },
    }
    const provider = fakeProvider([
      [{ type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'hi' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'all done' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'please echo hi' })
    const out = await runTurn({
      provider, model: 'm', cm, tools: [echoTool], systemPrompt: 'sys',
    })
    expect(calls).toEqual(['hi'])
    expect(out).toBe('all done')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/loop.test.ts`
Expected: FAIL — cannot find module `../src/loop.js`.

- [ ] **Step 4: Implement `packages/core/src/loop.ts`**

```ts
import type { Provider, ChatMessage, ToolCall } from '@maestro/providers'
import type { Tool } from '@maestro/tools'
import { ContextManager } from './context.js'
import { shouldCompact, compact } from './compaction.js'

export interface RunTurnOpts {
  provider: Provider
  model: string
  cm: ContextManager
  tools: Tool[]
  systemPrompt: string
  numCtx?: number
  cwd?: string
  compactBuffer?: number
  onText?: (delta: string) => void
  onToolStart?: (call: ToolCall) => void
  maxSteps?: number
}

/** Runs one user turn to completion: loops model<->tools until the model stops
 *  calling tools, returns the final assistant text. Auto-compacts before each step. */
export async function runTurn(opts: RunTurnOpts): Promise<string> {
  const { provider, model, cm, tools, systemPrompt } = opts
  const maxSteps = opts.maxSteps ?? 12
  const buffer = opts.compactBuffer ?? 1500
  const toolSchemas = tools.map(t => t.schema)

  let finalText = ''
  for (let step = 0; step < maxSteps; step++) {
    if (shouldCompact(cm.stats(), buffer)) {
      await compact(cm, {
        prefixCount: 1,
        summarize: async (prompt) => collectText(provider.chat({
          model, numCtx: opts.numCtx,
          messages: [{ role: 'user', content: prompt }],
        })),
      })
    }

    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...cm.messages()]
    let text = ''
    const toolCalls: ToolCall[] = []
    for await (const ev of provider.chat({ model, messages, tools: toolSchemas, numCtx: opts.numCtx })) {
      if (ev.type === 'text') { text += ev.delta; opts.onText?.(ev.delta) }
      else if (ev.type === 'tool_call') toolCalls.push(ev.call)
    }

    cm.add({ role: 'assistant', content: text, tool_calls: toolCalls.length ? toolCalls : undefined })

    if (toolCalls.length === 0) { finalText = text; break }

    for (const call of toolCalls) {
      opts.onToolStart?.(call)
      const tool = tools.find(t => t.schema.name === call.name)
      let result: string
      try {
        result = tool
          ? await tool.run(call.arguments, { cwd: opts.cwd ?? process.cwd() })
          : `Error: unknown tool ${call.name}`
      } catch (e) {
        result = `Error: ${(e as Error).message}`
      }
      cm.add({ role: 'tool', content: result, tool_call_id: call.id })
    }
  }
  return finalText
}

async function collectText(stream: AsyncIterable<{ type: string } & Record<string, unknown>>): Promise<string> {
  let out = ''
  for await (const ev of stream) if (ev.type === 'text') out += String(ev.delta)
  return out
}
```

- [ ] **Step 5: Modify `packages/core/src/index.ts`**

Append:

```ts
export { runTurn } from './loop.js'
export type { RunTurnOpts } from './loop.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/loop.test.ts`
Expected: PASS (system-prompt test + runTurn test).

- [ ] **Step 7: Run the full suite**

Run: `pnpm vitest run`
Expected: all tests across hardware/providers/core/tools PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): agentic loop with native tool calling + pre-step auto-compaction"
```

---

## Task 13: `tui` — ContextMeter component

**Files:**
- Create: `packages/tui/package.json`, `packages/tui/tsconfig.json`, `packages/tui/src/ContextMeter.tsx`, `packages/tui/src/index.ts`
- Test: `packages/tui/test/ContextMeter.test.tsx`

- [ ] **Step 1: Create `packages/tui/package.json`**

```json
{
  "name": "@maestro/tui",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts" },
  "dependencies": {
    "ink": "^5.0.0", "react": "^18.3.0",
    "@maestro/core": "workspace:*", "@maestro/providers": "workspace:*",
    "@maestro/hardware": "workspace:*", "@maestro/tools": "workspace:*"
  },
  "devDependencies": { "ink-testing-library": "^4.0.0", "@types/react": "^18.3.0" }
}
```

- [ ] **Step 2: Create `packages/tui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test `packages/tui/test/ContextMeter.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { ContextMeter } from '../src/ContextMeter.js'

describe('ContextMeter', () => {
  it('renders percent and token counts', () => {
    const { lastFrame } = render(
      <ContextMeter stats={{ used: 4900, effective: 8000, window: 8192, percentUsed: 0.6125 }} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('61%')
    expect(frame).toContain('4.9k')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run packages/tui/test/ContextMeter.test.tsx`
Expected: FAIL — cannot find module `../src/ContextMeter.js`.

- [ ] **Step 5: Implement `packages/tui/src/ContextMeter.tsx`**

```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { ContextStats } from '@maestro/core'

function k(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function ContextMeter({ stats }: { stats: ContextStats }): React.ReactElement {
  const pct = Math.min(100, Math.round(stats.percentUsed * 100))
  const filled = Math.round((pct / 100) * 10)
  const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled)
  const color = pct > 85 ? 'red' : pct > 65 ? 'yellow' : 'green'
  return (
    <Box>
      <Text color={color}>{bar} </Text>
      <Text>{pct}% · {k(stats.used)}/{k(stats.effective)}</Text>
    </Box>
  )
}
```

- [ ] **Step 6: Create `packages/tui/src/index.ts`**

```ts
export { ContextMeter } from './ContextMeter.js'
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run packages/tui/test/ContextMeter.test.tsx`
Expected: PASS. (If JSX errors occur, ensure `vitest.config.ts` uses the esbuild default — Vitest transforms TSX automatically.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(tui): ContextMeter component with color-coded usage bar"
```

---

## Task 14: `tui` — ModelPicker component

**Files:**
- Create: `packages/tui/src/ModelPicker.tsx`
- Modify: `packages/tui/src/index.ts`
- Test: `packages/tui/test/ModelPicker.test.tsx`

- [ ] **Step 1: Write the failing test `packages/tui/test/ModelPicker.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { ModelPicker } from '../src/ModelPicker.js'

const rows = [
  { id: 'qwen2.5-coder:7b', label: 'Qwen2.5-Coder 7B', verdict: 'fits' as const, sizeGB: 4.7, installed: true, tools: true },
  { id: 'qwen3-coder:30b', label: 'Qwen3-Coder 30B', verdict: 'wont-run' as const, sizeGB: 18, installed: false, tools: true },
]

describe('ModelPicker', () => {
  it('renders fit verdicts and an installed marker', () => {
    const { lastFrame } = render(<ModelPicker rows={rows} onSelect={() => {}} />)
    const f = lastFrame() ?? ''
    expect(f).toContain('Qwen2.5-Coder 7B')
    expect(f.toLowerCase()).toContain('installed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/tui/test/ModelPicker.test.tsx`
Expected: FAIL — cannot find module `../src/ModelPicker.js`.

- [ ] **Step 3: Implement `packages/tui/src/ModelPicker.tsx`**

```tsx
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { FitVerdict } from '@maestro/hardware'

export interface ModelRow {
  id: string
  label: string
  verdict: FitVerdict
  sizeGB: number
  installed: boolean
  tools: boolean
}

const VERDICT_ICON: Record<FitVerdict, string> = { fits: '🟢', tight: '🟡', 'wont-run': '🔴' }

export function ModelPicker(
  { rows, onSelect }: { rows: ModelRow[]; onSelect: (row: ModelRow) => void },
): React.ReactElement {
  const selectable = rows.filter(r => r.verdict !== 'wont-run')
  const [idx, setIdx] = useState(0)
  useInput((input, key) => {
    if (key.upArrow) setIdx(i => Math.max(0, i - 1))
    else if (key.downArrow) setIdx(i => Math.min(selectable.length - 1, i + 1))
    else if (key.return && selectable[idx]) onSelect(selectable[idx])
  })
  return (
    <Box flexDirection="column">
      <Text bold>Choose a model for this Mac:</Text>
      {rows.map((r) => {
        const sel = selectable[idx]?.id === r.id
        const disabled = r.verdict === 'wont-run'
        return (
          <Text key={r.id} color={disabled ? 'gray' : sel ? 'cyan' : undefined}>
            {sel ? '❯ ' : '  '}{VERDICT_ICON[r.verdict]} {r.label} · {r.sizeGB}GB
            {r.tools ? '' : ' · chat-only'}{r.installed ? ' · installed' : ' · download'}
          </Text>
        )
      })}
      <Text dimColor>↑/↓ to move · Enter to select</Text>
    </Box>
  )
}
```

- [ ] **Step 4: Modify `packages/tui/src/index.ts`**

Append:

```ts
export { ModelPicker } from './ModelPicker.js'
export type { ModelRow } from './ModelPicker.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/tui/test/ModelPicker.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tui): ModelPicker with fit verdicts, install/download + tool badges"
```

---

## Task 15: `cli` — config persistence

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/config.ts`
- Test: `packages/cli/test/config.test.ts`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "maestro-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "maestro": "./bin/maestro.js" },
  "main": "./dist/index.js",
  "scripts": { "build": "tsup src/index.ts --format esm" },
  "dependencies": {
    "ink": "^5.0.0", "react": "^18.3.0",
    "@maestro/core": "workspace:*", "@maestro/providers": "workspace:*",
    "@maestro/hardware": "workspace:*", "@maestro/tools": "workspace:*",
    "@maestro/tui": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test `packages/cli/test/config.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig, saveConfig } from '../src/config.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'maestro-cfg-')) })
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/test/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 5: Implement `packages/cli/src/config.ts`**

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface MaestroConfig {
  backend: 'ollama' | 'lmstudio' | 'mlx'
  model: string
  contextSize: number
}

function configDir(override?: string): string {
  return override ?? path.join(os.homedir(), '.maestro')
}

export async function loadConfig(dir?: string): Promise<MaestroConfig | null> {
  try {
    const raw = await readFile(path.join(configDir(dir), 'config.json'), 'utf8')
    return JSON.parse(raw) as MaestroConfig
  } catch {
    return null
  }
}

export async function saveConfig(cfg: MaestroConfig, dir?: string): Promise<void> {
  const d = configDir(dir)
  await mkdir(d, { recursive: true })
  await writeFile(path.join(d, 'config.json'), JSON.stringify(cfg, null, 2))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/test/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cli): ~/.maestro/config.json load/save"
```

---

## Task 16: `tui` — SetupWizard (wires hardware + catalog + picker + pull)

**Files:**
- Create: `packages/tui/src/SetupWizard.tsx`
- Modify: `packages/tui/src/index.ts`
- Test: `packages/tui/test/SetupWizard.test.tsx`

- [ ] **Step 1: Write the failing test `packages/tui/test/SetupWizard.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { buildModelRows } from '../src/SetupWizard.js'
import type { CatalogModel } from '@maestro/providers'
import type { SystemInfo } from '@maestro/hardware'

const sys: SystemInfo = {
  totalMemoryBytes: 16 * 1024 ** 3, totalMemoryGB: 16, usableMemoryGB: 11.2,
  chip: 'Apple M1', arch: 'arm64', cpuCores: 8,
}
const cat: CatalogModel[] = [
  { id: 'qwen2.5-coder:7b', label: '7B', params: '7B', quant: 'Q4', weightsGB: 4.7,
    kvPerKTokenGB: 0.12, defaultContext: 16384, tools: true, minTierGB: 16, recommendedForGB: [16] },
  { id: 'qwen3-coder:30b', label: '30B', params: '30B', quant: 'Q4', weightsGB: 18,
    kvPerKTokenGB: 0.2, defaultContext: 32768, tools: true, minTierGB: 32, recommendedForGB: [32] },
]

describe('buildModelRows', () => {
  it('computes verdicts and flags installed models', () => {
    const rows = buildModelRows(cat, sys, new Set(['qwen2.5-coder:7b']))
    const r7 = rows.find(r => r.id === 'qwen2.5-coder:7b')!
    const r30 = rows.find(r => r.id === 'qwen3-coder:30b')!
    expect(r7.verdict).toBe('fits')
    expect(r7.installed).toBe(true)
    expect(r30.verdict).toBe('wont-run')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/tui/test/SetupWizard.test.tsx`
Expected: FAIL — cannot find module `../src/SetupWizard.js`.

- [ ] **Step 3: Implement `packages/tui/src/SetupWizard.tsx`**

```tsx
import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { estimateFit, type SystemInfo } from '@maestro/hardware'
import type { CatalogModel, Provider, PullProgress } from '@maestro/providers'
import { ModelPicker, type ModelRow } from './ModelPicker.js'

export function buildModelRows(cat: CatalogModel[], sys: SystemInfo, installed: Set<string>): ModelRow[] {
  return cat.map((m) => {
    const fit = estimateFit(
      { weightsGB: m.weightsGB, contextTokens: m.defaultContext, kvPerKTokenGB: m.kvPerKTokenGB },
      sys,
    )
    return {
      id: m.id, label: m.label, verdict: fit.verdict, sizeGB: m.weightsGB,
      installed: installed.has(m.id), tools: m.tools,
    }
  })
}

export interface WizardResult { model: string; contextSize: number }

export function SetupWizard(props: {
  sys: SystemInfo
  catalog: CatalogModel[]
  installed: Set<string>
  provider: Provider
  onComplete: (r: WizardResult) => void
}): React.ReactElement {
  const rows = buildModelRows(props.catalog, props.sys, props.installed)
  const [pull, setPull] = useState<PullProgress | null>(null)
  const [pulling, setPulling] = useState(false)

  async function choose(row: ModelRow) {
    const model = props.catalog.find(m => m.id === row.id)!
    if (!row.installed) {
      setPulling(true)
      await props.provider.pull(row.id, p => setPull(p))
      setPulling(false)
    }
    props.onComplete({ model: row.id, contextSize: model.defaultContext })
  }

  if (pulling) {
    const pct = pull?.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : 0
    return <Text>Downloading… {pull?.status} {pct}%</Text>
  }

  return (
    <Box flexDirection="column">
      <Text bold>Maestro setup · {props.sys.chip} · {props.sys.totalMemoryGB}GB</Text>
      <ModelPicker rows={rows} onSelect={choose} />
    </Box>
  )
}
```

- [ ] **Step 4: Modify `packages/tui/src/index.ts`**

Append:

```ts
export { SetupWizard, buildModelRows } from './SetupWizard.js'
export type { WizardResult } from './SetupWizard.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/tui/test/SetupWizard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tui): SetupWizard — hardware-aware rows, pull-with-progress, completion"
```

---

## Task 17: `tui` — Repl component

**Files:**
- Create: `packages/tui/src/Repl.tsx`
- Modify: `packages/tui/src/index.ts`
- Test: `packages/tui/test/Repl.test.tsx`

- [ ] **Step 1: Write the failing test `packages/tui/test/Repl.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Repl } from '../src/Repl.js'

describe('Repl', () => {
  it('renders the prompt and context meter, and submits input to onSubmit', async () => {
    const onSubmit = vi.fn(async () => 'response text')
    const { lastFrame, stdin } = render(
      <Repl
        stats={{ used: 100, effective: 8000, window: 8192, percentUsed: 0.0125 }}
        transcript={[]}
        onSubmit={onSubmit}
        busy={false}
      />,
    )
    expect(lastFrame()).toContain('›') // prompt glyph
    stdin.write('hello\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('hello'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/tui/test/Repl.test.tsx`
Expected: FAIL — cannot find module `../src/Repl.js`.

- [ ] **Step 3: Implement `packages/tui/src/Repl.tsx`**

```tsx
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ContextStats } from '@maestro/core'
import { ContextMeter } from './ContextMeter.js'

export interface TranscriptEntry { role: 'user' | 'assistant' | 'tool'; text: string }

export function Repl(props: {
  stats: ContextStats
  transcript: TranscriptEntry[]
  onSubmit: (input: string) => void | Promise<unknown>
  busy: boolean
}): React.ReactElement {
  const [input, setInput] = useState('')
  useInput((ch, key) => {
    if (props.busy) return
    if (key.return) { const v = input; setInput(''); void props.onSubmit(v) }
    else if (key.backspace || key.delete) setInput(s => s.slice(0, -1))
    else if (ch && !key.ctrl && !key.meta) setInput(s => s + ch)
  })
  return (
    <Box flexDirection="column">
      {props.transcript.map((e, i) => (
        <Text key={i} color={e.role === 'user' ? 'cyan' : e.role === 'tool' ? 'gray' : undefined}>
          {e.role === 'user' ? '› ' : e.role === 'tool' ? '  ⚙ ' : ''}{e.text}
        </Text>
      ))}
      <Box marginTop={1}><ContextMeter stats={props.stats} /></Box>
      <Box>
        <Text color="cyan">› </Text>
        <Text>{input}</Text>
        <Text>{props.busy ? ' …thinking' : ''}</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 4: Modify `packages/tui/src/index.ts`**

Append:

```ts
export { Repl } from './Repl.js'
export type { TranscriptEntry } from './Repl.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/tui/test/Repl.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tui): Repl component — input, transcript, embedded context meter"
```

---

## Task 18: `cli` — app wiring (wizard-or-repl) + entrypoint

**Files:**
- Create: `packages/cli/src/app.tsx`, `packages/cli/src/index.ts`, `packages/cli/bin/maestro.js`
- Test: `packages/cli/test/decide.test.ts`

- [ ] **Step 1: Write the failing test `packages/cli/test/decide.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { decideStartScreen } from '../src/app.js'

describe('decideStartScreen', () => {
  it('shows setup when no config', () => {
    expect(decideStartScreen(null, { running: true })).toBe('setup')
  })
  it('shows backend-error when config exists but backend down', () => {
    expect(decideStartScreen({ backend: 'ollama', model: 'm', contextSize: 8192 }, { running: false })).toBe('backend-error')
  })
  it('shows repl when config + backend healthy', () => {
    expect(decideStartScreen({ backend: 'ollama', model: 'm', contextSize: 8192 }, { running: true })).toBe('repl')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/test/decide.test.ts`
Expected: FAIL — cannot find module `../src/app.js`.

- [ ] **Step 3: Implement `packages/cli/src/app.tsx`**

```tsx
import React, { useState, useEffect } from 'react'
import { Box, Text, useApp } from 'ink'
import { computeSystemInfo, type SystemInfo } from '@maestro/hardware'
import { OllamaProvider, loadCatalog } from '@maestro/providers'
import type { HealthStatus, CatalogModel } from '@maestro/providers'
import {
  ContextManager, buildSystemPrompt, runTurn, type ContextStats,
} from '@maestro/core'
import { allTools } from '@maestro/tools'
import { SetupWizard, Repl, type TranscriptEntry } from '@maestro/tui'
import { loadConfig, saveConfig, type MaestroConfig } from './config.js'

export type StartScreen = 'setup' | 'backend-error' | 'repl'

export function decideStartScreen(cfg: MaestroConfig | null, health: HealthStatus): StartScreen {
  if (!cfg) return 'setup'
  if (!health.running) return 'backend-error'
  return 'repl'
}

export function App(): React.ReactElement {
  const provider = new OllamaProvider()
  const [screen, setScreen] = useState<StartScreen | 'loading'>('loading')
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [catalog, setCatalog] = useState<CatalogModel[]>([])
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [cfg, setCfg] = useState<MaestroConfig | null>(null)
  const [cm, setCm] = useState<ContextManager | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [stats, setStats] = useState<ContextStats>({ used: 0, effective: 0, window: 0, percentUsed: 0 })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [s, c, health, existing] = await Promise.all([
        computeSystemInfo(), loadCatalog(), provider.health(), loadConfig(),
      ])
      setSys(s); setCatalog(c); setCfg(existing)
      if (health.running) setInstalled(new Set((await provider.listLocal()).map(m => m.name)))
      const decided = decideStartScreen(existing, health)
      if (decided === 'repl' && existing) initRepl(existing)
      setScreen(decided)
    })()
  }, [])

  function initRepl(config: MaestroConfig) {
    const mgr = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
    setCm(mgr)
    setStats(mgr.stats())
  }

  async function onWizardComplete(r: { model: string; contextSize: number }) {
    const next: MaestroConfig = { backend: 'ollama', model: r.model, contextSize: r.contextSize }
    await saveConfig(next)
    setCfg(next); initRepl(next); setScreen('repl')
  }

  async function onSubmit(text: string) {
    if (!cm || !cfg || !sys) return
    cm.add({ role: 'user', content: text })
    setTranscript(t => [...t, { role: 'user', text }])
    setBusy(true)
    const reply = await runTurn({
      provider, model: cfg.model, cm, tools: allTools,
      systemPrompt: buildSystemPrompt({ cwd: process.cwd(), os: process.platform, toolNames: allTools.map(t => t.schema.name) }),
      numCtx: cfg.contextSize,
      onToolStart: (call) => setTranscript(t => [...t, { role: 'tool', text: `${call.name}(${JSON.stringify(call.arguments)})` }]),
    })
    setTranscript(t => [...t, { role: 'assistant', text: reply }])
    setStats(cm.stats())
    setBusy(false)
  }

  if (screen === 'loading' || !sys) return <Text>Starting Maestro…</Text>
  if (screen === 'backend-error')
    return <Text color="red">Ollama is not running. Start it with `ollama serve` and relaunch.</Text>
  if (screen === 'setup')
    return (
      <SetupWizard
        sys={sys} catalog={catalog} installed={installed}
        provider={provider} onComplete={onWizardComplete}
      />
    )
  return <Repl stats={stats} transcript={transcript} onSubmit={onSubmit} busy={busy} />
}
```

- [ ] **Step 4: Implement `packages/cli/src/index.ts`**

```ts
import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

export function main(): void {
  render(React.createElement(App))
}
```

- [ ] **Step 5: Implement `packages/cli/bin/maestro.js`**

```js
#!/usr/bin/env node
import { main } from '../dist/index.js'
main()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/test/decide.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Build everything**

Run: `pnpm -r build`
Expected: all packages build with no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(cli): wire hardware/providers/core/tools/tui into wizard-or-repl app"
```

---

## Task 19: End-to-end smoke test (manual) + README

**Files:**
- Create: `README.md`
- Test: manual run against a real Ollama instance

- [ ] **Step 1: Create `README.md`**

```markdown
# Maestro

A local-model terminal coding agent, optimized for small context windows and modest Macs.

## Requirements
- macOS (Apple Silicon), Node ≥ 20
- [Ollama](https://ollama.com) running (`ollama serve`)

## Develop
```bash
pnpm install
pnpm -r build
node packages/cli/bin/maestro.js
```

## First run
Maestro detects your Mac's memory, shows only models that will run, downloads your
pick, and drops you into a REPL with a live context meter.
```

- [ ] **Step 2: Manual smoke test — fresh setup**

Pre-req: `ollama serve` is running; `~/.maestro/config.json` does NOT exist (back it up if present).
Run: `pnpm -r build && node packages/cli/bin/maestro.js`
Expected: setup wizard appears showing your chip + RAM; the 7B model shows 🟢 on a 16GB+ Mac. Selecting an uninstalled model streams a download %; selecting an installed one drops straight to the REPL.

- [ ] **Step 3: Manual smoke test — agent does real work**

In the REPL, type: `create a file hello.txt containing the word maestro, then read it back`
Expected: transcript shows a `Write(...)` tool line then a `Read(...)` tool line; `hello.txt` exists on disk with `maestro`; the context meter advances. Confirm with `cat hello.txt`.

- [ ] **Step 4: Manual smoke test — persistence**

Quit (Ctrl+C) and rerun `node packages/cli/bin/maestro.js`.
Expected: no wizard — it loads the saved model and goes straight to the REPL.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add README and Phase 1 smoke-test checklist"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** §3 architecture → Tasks 0–18 (all packages). §4 provider abstraction + Ollama → Task 4. §5 hardware fitting → Tasks 1–2 + catalog Task 3. §6 setup wizard → Tasks 14/16/18. §7 agentic loop + native tools → Task 12. §8 tools (capped output) → Tasks 9–11. §9 context mgmt + compaction → Tasks 6–7 + integrated in Task 12. §11 slash commands, §10 skills, §12 subagents, §13 plan mode, parsed-tool fallback, LM Studio/MLX, 8GB tier → **intentionally deferred to Phases 2–4** per the spec's build phases.

**Placeholder scan:** No TBD/TODO; every code step shows complete code.

**Type consistency:** `Provider`/`ChatEvent`/`ToolCall`/`ToolSchema` defined in Task 4 are consumed unchanged in Tasks 5–18. `ContextStats` (Task 6) is consumed by ContextMeter (Task 13) and Repl (Task 17). `Tool`/`ToolContext` (Task 9) used by all tools and the loop (Task 12). `MaestroConfig` (Task 15) used by app (Task 18). `FitVerdict`/`SystemInfo`/`CatalogModel` consistent across hardware/providers/tui.

**Deferred-to-later-phase items are explicit, not gaps.**
