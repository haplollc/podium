# Podium Phase 4 (Reach & Distribution) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Multi-backend support (LM Studio + MLX via an OpenAI-compatible base, plus a backend factory + detection), an 8GB tiny-model tier, a pragmatic hooks subset, CLI commands (`--version`, `--help`, `update`), and real distribution: a bundled npm package, a Homebrew formula, and a GitHub Actions release pipeline.

**Architecture:** A shared `OpenAICompatProvider` (SSE streaming + native tool-call accumulation) that `LMStudioProvider` and `MLXProvider` extend; a `getProvider(backend)` factory and `detectBackends()` probe. A `hooks` module (settings.json-driven command hooks for SessionStart/UserPromptSubmit/PreToolUse/PreCompact) wired into the loop/app. CLI gains argv handling before rendering. The `cli` package builds to a self-contained bundle (`@podium/*` inlined) so `npm i -g` and Homebrew both work.

**Tech Stack:** Phase 1–3 stack. No new runtime deps (SSE parsed by hand; `execa` already present).

---

## Task 1: OpenAI-compatible provider base (SSE)

**Files:** Create `packages/providers/src/openai-compat.ts`; Test `test/openai-compat.test.ts`; Modify index.

- [ ] **Failing test:** mock `fetch` returning an SSE body with text deltas then a tool_call then `[DONE]`; assert `chat()` yields the concatenated text, the assembled tool call, and `done`. `health()`/`listLocal()` read `GET /v1/models` (`{data:[{id}]}`).
- [ ] **Implement:**

```ts
import type {
  Provider, HealthStatus, LocalModel, PullProgress, ModelCapabilities,
  ChatRequest, ChatEvent, ToolCall,
} from './types.js'

export class OpenAICompatProvider implements Provider {
  constructor(
    readonly id: 'lmstudio' | 'mlx',
    protected base: string,
  ) {}

  async health(): Promise<HealthStatus> {
    try { const r = await fetch(`${this.base}/models`); return { running: r.ok } }
    catch (e) { return { running: false, detail: (e as Error).message } }
  }

  async listLocal(): Promise<LocalModel[]> {
    const r = await fetch(`${this.base}/models`)
    const data = await r.json() as { data?: { id: string }[] }
    return (data.data ?? []).map(m => ({ name: m.id, sizeBytes: 0 }))
  }

  async pull(_model: string, _onProgress: (p: PullProgress) => void): Promise<void> {
    throw new Error(`${this.id}: model download is not supported here; install the model in the backend.`)
  }

  async capabilities(_model: string): Promise<ModelCapabilities> {
    // OpenAI-compatible servers don't advertise capabilities; assume tools and rely
    // on the parsed-tool fallback if the model emits calls as text.
    return { tools: true }
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const r = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map(m => ({
          role: m.role, content: m.content,
          tool_calls: m.tool_calls?.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })),
          tool_call_id: m.tool_call_id,
        })),
        tools: req.tools?.map(t => ({ type: 'function', function: t })),
        temperature: req.temperature ?? 0.2,
        stream: true,
      }),
    })
    if (!r.body) throw new Error('no response body from /chat/completions')
    const acc = new Map<number, { id: string; name: string; args: string }>()
    for await (const data of readSse(r.body)) {
      if (data === '[DONE]') break
      const j = JSON.parse(data) as { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] }
      const delta = j.choices?.[0]?.delta
      if (delta?.content) yield { type: 'text', delta: delta.content }
      for (const tc of delta?.tool_calls ?? []) {
        const cur = acc.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        acc.set(tc.index, cur)
      }
    }
    for (const [i, c] of acc) {
      let args: Record<string, unknown> = {}
      try { args = c.args ? JSON.parse(c.args) : {} } catch { /* leave empty */ }
      const call: ToolCall = { id: c.id || `oai_${c.name}_${i}`, name: c.name, arguments: args }
      if (call.name) yield { type: 'tool_call', call }
    }
    yield { type: 'done' }
  }
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}
```

- [ ] Run pass; export; commit `feat(providers): OpenAI-compatible base provider with SSE streaming`.

---

## Task 2: LM Studio + MLX adapters + factory + detection

**Files:** Create `packages/providers/src/lmstudio.ts`, `src/mlx.ts`, `src/factory.ts`; Modify index; Test `test/factory.test.ts`.

- [ ] **lmstudio.ts:**

```ts
import { execa } from 'execa'
import { OpenAICompatProvider } from './openai-compat.js'
import type { PullProgress } from './types.js'
export class LMStudioProvider extends OpenAICompatProvider {
  constructor(base = process.env.LMSTUDIO_HOST ?? 'http://localhost:1234/v1') { super('lmstudio', base) }
  async pull(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
    onProgress({ status: `lms get ${model}` })
    await execa('lms', ['get', model], { reject: true })   // requires the LM Studio CLI
    onProgress({ status: 'success' })
  }
}
```

- [ ] **mlx.ts:**

```ts
import { OpenAICompatProvider } from './openai-compat.js'
export class MLXProvider extends OpenAICompatProvider {
  constructor(base = process.env.MLX_HOST ?? 'http://localhost:8080/v1') { super('mlx', base) }
  // pull() inherited: MLX downloads from HF on first model load.
}
```

- [ ] **factory.ts:**

```ts
import type { Provider } from './types.js'
import { OllamaProvider } from './ollama.js'
import { LMStudioProvider } from './lmstudio.js'
import { MLXProvider } from './mlx.js'
export type BackendId = 'ollama' | 'lmstudio' | 'mlx'
export function getProvider(backend: BackendId): Provider {
  if (backend === 'lmstudio') return new LMStudioProvider()
  if (backend === 'mlx') return new MLXProvider()
  return new OllamaProvider()
}
export async function detectBackends(): Promise<BackendId[]> {
  const all: BackendId[] = ['ollama', 'lmstudio', 'mlx']
  const results = await Promise.all(all.map(async id => ({ id, ok: (await getProvider(id).health()).running })))
  return results.filter(r => r.ok).map(r => r.id)
}
```

- [ ] **Failing test:** `getProvider('mlx').id === 'mlx'`; `getProvider('lmstudio').id === 'lmstudio'`; `getProvider('ollama').id === 'ollama'`. `detectBackends()` with all `health` mocked down returns `[]` (stub fetch to reject).
- [ ] Run pass; export `LMStudioProvider`, `MLXProvider`, `getProvider`, `detectBackends`, `BackendId`; commit `feat(providers): LM Studio + MLX adapters, backend factory + detection`.

---

## Task 3: 8GB tiny-model tier

**Files:** Modify `models/catalog.json`; Test `packages/providers/test/catalog.test.ts` (add case).

- [ ] Prepend a 1.5B entry and keep the 3B (mark both 8GB tier):

```json
{ "id": "qwen2.5-coder:1.5b", "label": "Qwen2.5-Coder 1.5B", "params": "1.5B",
  "quant": "Q4_K_M", "weightsGB": 1.0, "kvPerKTokenGB": 0.04, "defaultContext": 8192,
  "tools": true, "minTierGB": 8, "recommendedForGB": [8] },
```

(Move `recommendedForGB:[8]` to the 1.5B; change the 3B to `recommendedForGB: []` so the 1.5B is the 8GB default but the 3B stays selectable.)

- [ ] **Failing test:** `recommendedFor(cat, 8)?.id === 'qwen2.5-coder:1.5b'`; both 1.5B and 3B have `minTierGB === 8`.
- [ ] Run pass; commit `feat(models): add 1.5B entry for the 8GB tier`.

---

## Task 4: Hooks subset

**Files:** Create `packages/cli/src/hooks.ts`; Test `test/hooks.test.ts`; wire into `app.tsx` + `loop.ts` (PreToolUse via `onPermissionAsk`-style hook).

- [ ] **hooks.ts** — load `~/.podium/settings.json` `{ hooks: { <Event>: [{ command }] } }`; run matching command hooks, passing a JSON payload on stdin; for `PreToolUse`, a hook that exits non-zero or prints `{"decision":"deny"}` blocks the tool.

```ts
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'

export type HookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PreCompact'
interface HookCmd { command: string }
type HookConfig = Partial<Record<HookEvent, HookCmd[]>>

export async function loadHooks(dir = path.join(os.homedir(), '.podium')): Promise<HookConfig> {
  try { return (JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8')).hooks ?? {}) as HookConfig }
  catch { return {} }
}

/** Returns false if any PreToolUse hook denies; true otherwise. Non-PreToolUse events ignore the result. */
export async function runHooks(cfg: HookConfig, event: HookEvent, payload: unknown): Promise<boolean> {
  for (const h of cfg[event] ?? []) {
    const r = await execa(h.command, { shell: true, input: JSON.stringify(payload), reject: false })
    if (event === 'PreToolUse') {
      if (r.exitCode !== 0) return false
      try { if (JSON.parse(r.stdout)?.decision === 'deny') return false } catch { /* ignore */ }
    }
  }
  return true
}
```

- [ ] **Failing test:** with a `PreToolUse` hook `command: 'exit 2'`, `runHooks` returns false; with `command: 'true'`, returns true; missing settings → `loadHooks` returns `{}`.
- [ ] **Wire (app.tsx):** load hooks at startup; fire `SessionStart` once; in `onSubmit` fire `UserPromptSubmit`; pass a `preToolUse` callback into `runTurn` that calls `runHooks(cfg,'PreToolUse',call)` and denies when false (compose with the existing permission ask). Fire `PreCompact` inside the compact path. (Add `preToolUse?: (call) => Promise<boolean>` to `RunTurnOpts`, checked alongside `decide`.)
- [ ] Run pass; commit `feat(cli): pragmatic hooks subset (SessionStart/UserPromptSubmit/PreToolUse/PreCompact)`.

---

## Task 5: CLI commands — version / help / update

**Files:** Modify `packages/cli/src/index.ts`; Create `packages/cli/src/update.ts`; Test `test/update.test.ts`.

- [ ] **update.ts:** `detectInstall()` returns `'brew' | 'npm' | 'unknown'` by checking whether the running path is under a Homebrew prefix (`/opt/homebrew` or `/usr/local/Cellar`); `updateCommand(install)` returns the shell command string (`brew upgrade podium` vs `npm i -g podium-cli@latest`). `runUpdate()` executes it via execa.

```ts
import { execa } from 'execa'
export type Install = 'brew' | 'npm' | 'unknown'
export function detectInstall(execPath = process.argv[1] ?? ''): Install {
  if (execPath.includes('/Cellar/') || execPath.includes('/opt/homebrew/')) return 'brew'
  if (execPath.includes('/node_modules/') || execPath.includes('/lib/node_modules/')) return 'npm'
  return 'unknown'
}
export function updateCommand(install: Install): string {
  if (install === 'brew') return 'brew upgrade podium'
  return 'npm install -g podium-cli@latest'
}
export async function runUpdate(): Promise<void> {
  const cmd = updateCommand(detectInstall())
  console.log(`Updating via: ${cmd}`)
  await execa(cmd, { shell: true, stdio: 'inherit' })
}
```

- [ ] **index.ts:** before rendering, parse `process.argv.slice(2)`:
  - `--version` / `-v` → print version (read from package.json via `import pkg from '../package.json' with { type: 'json' }`) and exit.
  - `--help` / `-h` → print usage and exit.
  - `update` → `await runUpdate()` and exit.
  - else → render the app.
- [ ] **Failing test:** `detectInstall('/opt/homebrew/bin/podium') === 'brew'`; `detectInstall('/usr/lib/node_modules/podium-cli/bin/podium.js') === 'npm'`; `updateCommand('brew')` contains `brew upgrade`; `updateCommand('npm')` contains `npm install -g`.
- [ ] Run pass; commit `feat(cli): --version/--help and self-update (brew/npm aware)`.

---

## Task 6: Bundled build + Homebrew formula + release pipeline

**Files:** Modify `packages/cli/package.json` (bundle config, files, publishConfig); Create `packages/cli/tsup.config.ts`, `Formula/podium.rb`, `.github/workflows/release.yml`; Modify `README.md`.

- [ ] **tsup.config.ts (cli):** bundle workspace packages so the published artifact is self-contained.

```ts
import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: [/^@podium\//],   // inline workspace deps
  // ink/react/yaml/execa stay external (declared as dependencies)
  target: 'node20',
  clean: true,
})
```

- [ ] **cli/package.json:** set `"build": "tsup"`, add `"files": ["dist", "bin"]`, real `dependencies` (ink, react, yaml, execa) with concrete versions (no `workspace:*` left for runtime), `"publishConfig": { "access": "public" }`, `"version"` aligned to release tags. Remove `@podium/*` from `dependencies` (now inlined) — keep them as `devDependencies` for the build.
- [ ] **Formula/podium.rb:**

```ruby
class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/jaredcassoutt/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-VERSION.tgz"
  sha256 "REPLACED_BY_CI"
  license "MIT"
  depends_on "node"
  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end
  test do
    assert_match "podium", shell_output("#{bin}/podium --version")
  end
end
```

- [ ] **.github/workflows/release.yml:** on `push` tags `v*` → checkout, setup Node, `pnpm install`, `pnpm -r build`, `pnpm --filter podium-cli build`, `npm publish` (from `packages/cli`, using `NODE_AUTH_TOKEN`), then compute the tarball sha256 and open a PR/commit bumping `Formula/podium.rb` `url`+`sha256`.
- [ ] **README.md:** install via `npm install -g podium-cli` or `brew install jaredcassoutt/tap/podium`; `podium update` to upgrade.
- [ ] **Verify:** `pnpm --filter podium-cli build` produces a `dist/index.js` with no `@podium/*` imports (grep it); `node packages/cli/bin/podium.js --version` prints the version.
- [ ] Commit `feat(dist): bundled npm build, Homebrew formula, GitHub Actions release`.

---

## Self-Review

- **Spec coverage:** LM Studio + MLX (T1–T2), backend factory/detection (T2), 8GB tier (T3), hooks subset (T4), npm + brew + auto-update + CI (T5–T6).
- **Type consistency:** both adapters implement `Provider` via `OpenAICompatProvider`; `BackendId` aligns with `Provider.id` union. `RunTurnOpts` gains `preToolUse` mirroring `onPermissionAsk`.
- **Risks:** SSE tool-call accumulation is the trickiest bit (Task 1 test covers it); LM Studio `pull` needs the `lms` CLI (documented; errors clearly otherwise); bundling must drop all `workspace:*` runtime deps (Task 6 verify step greps for `@podium/`).
- **Placeholders:** none (CI sha256 is intentionally CI-substituted).
