# Podium Phase 2 (Robustness & Control) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Make Podium safe and controllable: slash commands (`/model`, `/models`, `/pull`, `/context`, `/compact`, `/clear`, `/help`), permission modes gating mutating tools, a TodoWrite tool, and tool-call auto-repair.

**Architecture:** New pure, testable modules in `core` (`slash`, `permission`, repair logic in `loop`) and a `TodoWrite` tool in `tools`. The `cli` app wires slash dispatch + a permission-prompt UI. Phase 1's `Provider`/`Tool`/`ContextManager` interfaces are unchanged except `ToolContext` gains an optional todo store and `RunTurnOpts` gains a permission hook.

**Tech Stack:** Same as Phase 1 (TypeScript, Vitest, Ink).

---

## Task 1: Slash command parser + registry (`core/slash.ts`)

**Files:** Create `packages/core/src/slash.ts`; Test `packages/core/test/slash.test.ts`; Modify `packages/core/src/index.ts`.

- [ ] **Step 1: Failing test** — `parseSlash('/model gpt-oss:20b')` → `{ name:'model', args:'gpt-oss:20b' }`; `parseSlash('hello')` → `null`; `parseSlash('/help')` → `{name:'help',args:''}`.
- [ ] **Step 2:** Run, expect fail.
- [ ] **Step 3: Implement**

```ts
export interface SlashCommand { name: string; args: string }
export function parseSlash(input: string): SlashCommand | null {
  const t = input.trim()
  if (!t.startsWith('/')) return null
  const sp = t.indexOf(' ')
  if (sp === -1) return { name: t.slice(1), args: '' }
  return { name: t.slice(1, sp), args: t.slice(sp + 1).trim() }
}

export const BUILTIN_SLASH = ['model', 'models', 'pull', 'context', 'compact', 'clear', 'help'] as const
export type BuiltinSlash = typeof BUILTIN_SLASH[number]
export function isBuiltinSlash(name: string): name is BuiltinSlash {
  return (BUILTIN_SLASH as readonly string[]).includes(name)
}
```

- [ ] **Step 4:** Run, expect pass. **Step 5:** export from index. **Step 6:** commit `feat(core): slash command parser + builtin registry`.

---

## Task 2: Permission model (`core/permission.ts`)

**Files:** Create `packages/core/src/permission.ts`; Test `packages/core/test/permission.test.ts`; Modify index.

- [ ] **Step 1: Failing test:**
  - `decide('Read','default')` → `'allow'` (read-only always allowed)
  - `decide('Write','default')` → `'ask'`
  - `decide('Write','acceptEdits')` → `'allow'`
  - `decide('Bash','acceptEdits')` → `'ask'`
  - `decide('Write','plan')` → `'deny'`
  - `decide('Bash','yolo')` → `'allow'`
- [ ] **Step 2:** Run, expect fail.
- [ ] **Step 3: Implement**

```ts
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'yolo'
export type PermissionDecision = 'allow' | 'ask' | 'deny'

const READ_ONLY = new Set(['Read', 'Grep', 'Glob'])
const EDIT_TOOLS = new Set(['Write', 'Edit'])

export function decide(tool: string, mode: PermissionMode): PermissionDecision {
  if (READ_ONLY.has(tool)) return 'allow'
  if (mode === 'yolo') return 'allow'
  if (mode === 'plan') return 'deny'                 // no mutations in plan mode
  if (mode === 'acceptEdits') return EDIT_TOOLS.has(tool) ? 'allow' : 'ask'
  return 'ask'                                       // default mode asks for any mutation
}
```

- [ ] **Step 4:** Run, expect pass. **Step 5:** export. **Step 6:** commit `feat(core): permission modes + per-tool decision`.

---

## Task 3: Wire permission gate into the loop (`core/loop.ts`)

**Files:** Modify `packages/core/src/loop.ts`; Test `packages/core/test/loop.test.ts` (add cases).

- [ ] **Step 1: Failing test:** with `mode:'plan'`, a turn whose model calls `Write` records a tool result containing `denied` and never invokes the tool's `run`. With `onPermissionAsk` returning `false`, a `default`-mode `Write` is also denied.
- [ ] **Step 2:** Run, expect fail.
- [ ] **Step 3: Implement** — add to `RunTurnOpts`: `mode?: PermissionMode` (default `'default'`) and `onPermissionAsk?: (call: ToolCall) => Promise<boolean>`. Before executing each call:

```ts
import { decide } from './permission.js'
// inside the tool-execution loop, before tool.run:
const d = decide(call.name, opts.mode ?? 'default')
if (d === 'deny') { cm.add({ role:'tool', content:`Permission denied: ${call.name} is not allowed in ${opts.mode} mode.`, tool_call_id: call.id }); continue }
if (d === 'ask') {
  const ok = opts.onPermissionAsk ? await opts.onPermissionAsk(call) : true
  if (!ok) { cm.add({ role:'tool', content:`Permission denied by user: ${call.name}.`, tool_call_id: call.id }); continue }
}
// else allow -> run as before
```

- [ ] **Step 4:** Run, expect pass. **Step 5:** commit `feat(core): enforce permission decisions in the agentic loop`.

---

## Task 4: Auto-repair malformed tool intent (`core/loop.ts`)

**Files:** Modify `packages/core/src/loop.ts`; Test add case in `loop.test.ts`.

- [ ] **Step 1: Failing test:** a provider that first returns text mentioning a known tool name inside a broken JSON blob (no valid call parsed, no final answer), then on the next step returns a valid call. Assert the loop injects a repair `user` message containing `valid JSON` and ultimately executes the tool. Use a helper `looksLikeToolAttempt`.
- [ ] **Step 2:** Run, expect fail.
- [ ] **Step 3: Implement** — after the dual-path parse, if `effectiveCalls` is empty AND `looksLikeToolAttempt(assistantText, toolSchemas)` is true, add a repair message and `continue` (don't treat as final):

```ts
function looksLikeToolAttempt(text: string, schemas: { name: string }[]): boolean {
  const hasBrace = text.includes('{') && text.includes('}')
  return hasBrace && schemas.some(s => text.includes(s.name))
}
// in the loop, replacing the `if (effectiveCalls.length === 0) { finalText = assistantText; break }`:
if (effectiveCalls.length === 0) {
  if (repairs < (opts.maxRepairs ?? 1) && looksLikeToolAttempt(assistantText, toolSchemas)) {
    repairs++
    cm.add({ role: 'user', content: 'Your previous message looked like a tool call but was not valid. Reply with ONLY a JSON object: {"name": <tool>, "arguments": {...}}. No prose.' })
    continue
  }
  finalText = assistantText; break
}
```

Add `maxRepairs?: number` to `RunTurnOpts` and a `let repairs = 0` counter before the loop.

- [ ] **Step 4:** Run, expect pass. **Step 5:** commit `feat(core): bounded auto-repair for malformed tool calls`.

---

## Task 5: TodoWrite tool (`tools/todo.ts`)

**Files:** Create `packages/tools/src/todo.ts`; Modify `packages/tools/src/types.ts` (add `todos?` to `ToolContext`), `packages/tools/src/index.ts`; Test `packages/tools/test/todo.test.ts`.

- [ ] **Step 1:** Add to `ToolContext`: `todos?: TodoStore` where `TodoStore` is `{ set(items: TodoItem[]): void; get(): TodoItem[] }` and `TodoItem = { content: string; status: 'pending'|'in_progress'|'completed' }`.
- [ ] **Step 2: Failing test:** `todoTool.run({ todos:[{content:'a',status:'pending'}] }, { cwd, todos: store })` sets the store and returns a rendered checklist string containing `[ ] a`.
- [ ] **Step 3:** Run, expect fail.
- [ ] **Step 4: Implement**

```ts
import type { Tool } from './types.js'
export interface TodoItem { content: string; status: 'pending' | 'in_progress' | 'completed' }
export interface TodoStore { set(items: TodoItem[]): void; get(): TodoItem[] }

const MARK = { pending: '[ ]', in_progress: '[~]', completed: '[x]' } as const

export const todoTool: Tool = {
  schema: {
    name: 'TodoWrite',
    description: 'Track a structured task list for multi-step work. Pass the full list each call. Use for 3+ step tasks.',
    parameters: {
      type: 'object',
      properties: {
        todos: { type: 'array', items: {
          type: 'object',
          properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } },
          required: ['content', 'status'],
        } },
      },
      required: ['todos'],
    },
  },
  async run(args, ctx) {
    const items = (args.todos as TodoItem[]) ?? []
    ctx.todos?.set(items)
    return items.map(t => `${MARK[t.status]} ${t.content}`).join('\n') || '(no todos)'
  },
}
```

- [ ] **Step 5:** Run, expect pass. Add `todoTool` to `allTools`; export `TodoItem`/`TodoStore`. **Step 6:** commit `feat(tools): TodoWrite tool with shared store`.

---

## Task 6: Slash dispatch + permission prompt in the CLI

**Files:** Create `packages/cli/src/slash-handlers.ts`; Test `packages/cli/test/slash-handlers.test.ts`; Modify `packages/cli/src/app.tsx` and `packages/tui` (a `PermissionPrompt` + mode indicator; a `/help` text block).

- [ ] **Step 1: Failing test (pure handler logic):** `runSlash({name:'help'}, ctx)` returns a string listing commands; `runSlash({name:'clear'}, ctx)` calls `ctx.clear()`; `runSlash({name:'context'}, ctx)` returns a string containing the percent from `ctx.stats()`; unknown command returns an `Unknown command` string.
- [ ] **Step 2:** Run, expect fail.
- [ ] **Step 3: Implement** `slash-handlers.ts`

```ts
import type { ContextStats } from '@podium/core'
export interface SlashCtx {
  stats(): ContextStats
  clear(): void
  compact(): Promise<void>
  openModelPicker(): void
  listModels(): Promise<string[]>
  pull(model: string): Promise<void>
}
export async function runSlash(cmd: { name: string; args: string }, ctx: SlashCtx): Promise<string> {
  switch (cmd.name) {
    case 'help': return 'Commands: /model /models /pull <name> /context /compact /clear /help'
    case 'clear': ctx.clear(); return 'Conversation cleared.'
    case 'context': { const s = ctx.stats(); return `Context: ${Math.round(s.percentUsed * 100)}% (${s.used}/${s.effective} tokens)` }
    case 'compact': await ctx.compact(); return 'Compacted conversation.'
    case 'model': ctx.openModelPicker(); return 'Opening model picker…'
    case 'models': return `Installed: ${(await ctx.listModels()).join(', ') || '(none)'}`
    case 'pull': if (!cmd.args) return 'Usage: /pull <model>'; await ctx.pull(cmd.args); return `Pulled ${cmd.args}.`
    default: return `Unknown command: /${cmd.name}. Try /help`
  }
}
```

- [ ] **Step 4:** Run, expect pass.
- [ ] **Step 5:** In `app.tsx` `onSubmit`, before calling `runTurn`: `const slash = parseSlash(text); if (slash) { const msg = await runSlash(slash, slashCtx); pushTranscript(msg); return }`. Wire `clear` to reset `ContextManager` + transcript; `compact` to call `compact(cm, …)`; `openModelPicker` to set `screen='setup'`; `listModels`/`pull` via the provider. Pass `mode` from config (default `'default'`) and an `onPermissionAsk` that renders a `PermissionPrompt` and resolves on the user's y/n.
- [ ] **Step 6:** Manual smoke: `/help`, `/context`, `/models`, `/clear`, `/model` (reopens picker), and a `Write` in default mode prompts for permission.
- [ ] **Step 7:** commit `feat(cli): slash command dispatch + permission prompt UI`.

---

## Self-Review

- **Spec coverage:** Phase-2 bullets — parsed-tool fallback (done in Phase 1), auto-repair (Task 4), TodoWrite (Task 5), permission modes (Tasks 2–3), `/model //context //compact` + friends (Tasks 1,6). Config persistence already done Phase 1.
- **Type consistency:** `PermissionMode`/`PermissionDecision` (Task 2) consumed by loop (Task 3) and app (Task 6). `SlashCommand` (Task 1) consumed by Task 6. `TodoStore`/`TodoItem` (Task 5) added to `ToolContext`.
- **Placeholders:** none — code shown for each implementing step.
