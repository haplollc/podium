# Maestro Phase 3 (Power Features) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Add Claude Code-compatible **Skills** (SKILL.md + progressive disclosure), **subagents** (Task tool with isolated context), **plan mode**, and **hierarchical memory** (MAESTRO.md / CLAUDE.md).

**Architecture:** New `@maestro/skills` package (parse + discover + registry + progressive-disclosure listing). Memory loader + skill/task/plan tools. `ToolContext` gains `skills`, `spawnAgent`, `exitPlan`. The agentic loop stays the same; `cli` wires a skill registry, a subagent spawner (fresh `ContextManager` + base tools, returns one report), plan-mode toggle, and `/skills` / `/skill-name` / `/plan` slash commands. `buildSystemPrompt` gains optional `memory`, `skillListing`, and `planMode` sections.

**Tech Stack:** Phase 1/2 stack + `yaml` (frontmatter parsing).

---

## Task 1: `@maestro/skills` — parse SKILL.md

**Files:** Create `packages/skills/package.json`, `tsconfig.json`, `src/parse.ts`, `src/types.ts`, `src/index.ts`; Test `test/parse.test.ts`.

- [ ] **package.json** depends on `yaml` and `@maestro/tools` (for the SkillRegistry type contract is in tools; skills imports nothing from tools — keep one-way). Actually skills has NO maestro deps; `yaml` only.
- [ ] **types.ts:**

```ts
export interface SkillFrontmatter {
  name: string
  description: string
  whenToUse?: string
  allowedTools?: string[]
  userInvocable?: boolean
  argumentHint?: string
}
export interface ParsedSkill extends SkillFrontmatter { body: string }
export interface SkillMeta { name: string; description: string; path: string }
```

- [ ] **Failing test:** `parseSkill(text)` on a doc with `---\nname: commit\ndescription: Make a git commit\nallowed-tools:\n  - Bash\n---\nBody here.` returns `{ name:'commit', description:'Make a git commit', allowedTools:['Bash'], body:'Body here.' }`. Missing frontmatter throws.
- [ ] **Implement parse.ts:**

```ts
import { parse as parseYaml } from 'yaml'
import type { ParsedSkill } from './types.js'

export function parseSkill(content: string): ParsedSkill {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!m) throw new Error('SKILL.md missing YAML frontmatter')
  const fm = (parseYaml(m[1]) ?? {}) as Record<string, unknown>
  const name = String(fm.name ?? '')
  const description = String(fm.description ?? '')
  if (!name || !description) throw new Error('SKILL.md frontmatter needs name and description')
  const allowed = fm['allowed-tools'] ?? fm.allowedTools
  return {
    name,
    description,
    whenToUse: fm.when_to_use ? String(fm.when_to_use) : undefined,
    allowedTools: Array.isArray(allowed) ? allowed.map(String) : undefined,
    userInvocable: fm['user-invocable'] !== false,
    argumentHint: fm['argument-hint'] ? String(fm['argument-hint']) : undefined,
    body: m[2].trim(),
  }
}

export function interpolateArgs(body: string, args: string): string {
  const parts = args.length ? args.split(/\s+/) : []
  let out = body.replace(/\$ARGUMENTS/g, args)
  out = out.replace(/\$(\d+)/g, (_, n) => parts[Number(n) - 1] ?? '')
  return out
}
```

- [ ] Run pass; export; commit `feat(skills): SKILL.md parser + arg interpolation`.

---

## Task 2: `@maestro/skills` — discovery + registry

**Files:** Create `src/discover.ts`, `src/registry.ts`; Modify index; Test `test/discover.test.ts`.

- [ ] **Failing test:** given a temp dir with `myskill/SKILL.md`, `discoverSkills([dir])` returns one `SkillMeta` with `name`/`description`/`path`. `SkillRegistry.getBody('myskill','')` returns the body; unknown returns `null`. `buildSkillListing(metas)` produces a string containing each name + description.
- [ ] **Implement discover.ts:**

```ts
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseSkill } from './parse.js'
import type { SkillMeta } from './types.js'

export async function discoverSkills(roots: string[]): Promise<SkillMeta[]> {
  const seen = new Map<string, SkillMeta>()
  for (const root of roots) {
    let entries: string[] = []
    try { entries = await readdir(root) } catch { continue }
    for (const entry of entries) {
      const file = path.join(root, entry, 'SKILL.md')
      try {
        if (!(await stat(file)).isFile()) continue
        const parsed = parseSkill(await readFile(file, 'utf8'))
        if (!seen.has(parsed.name)) seen.set(parsed.name, { name: parsed.name, description: parsed.description, path: file })
      } catch { /* skip malformed */ }
    }
  }
  return [...seen.values()]
}

export function defaultSkillRoots(home: string, cwd: string): string[] {
  return [
    path.join(cwd, '.maestro', 'skills'),
    path.join(home, '.maestro', 'skills'),
    path.join(home, '.claude', 'skills'), // Claude Code compatibility
  ]
}
```

- [ ] **Implement registry.ts:**

```ts
import { readFile } from 'node:fs/promises'
import { parseSkill, interpolateArgs } from './parse.js'
import type { SkillMeta } from './types.js'

export class SkillRegistry {
  constructor(private metas: SkillMeta[]) {}
  list(): SkillMeta[] { return this.metas }
  async getBody(name: string, args = ''): Promise<string | null> {
    const meta = this.metas.find(m => m.name === name)
    if (!meta) return null
    const parsed = parseSkill(await readFile(meta.path, 'utf8'))
    return interpolateArgs(parsed.body, args)
  }
}

export function buildSkillListing(metas: SkillMeta[]): string {
  if (!metas.length) return ''
  const lines = metas.map(m => `- ${m.name}: ${m.description}`)
  return `Available skills (invoke with the Skill tool or /<name>):\n${lines.join('\n')}`
}
```

- [ ] Run pass; export all; commit `feat(skills): discovery, SkillRegistry, progressive-disclosure listing`.

---

## Task 3: tools — Skill, Task, ExitPlanMode + ToolContext extensions

**Files:** Modify `packages/tools/src/types.ts`; Create `src/skill.ts`, `src/task.ts`, `src/exit-plan.ts`; Modify `src/index.ts`; Test `test/agent-tools.test.ts`.

- [ ] **types.ts additions:**

```ts
export interface SkillRef { name: string; description: string }
export interface ToolContextSkills { list(): SkillRef[]; getBody(name: string, args?: string): Promise<string | null> }

export interface ToolContext {
  cwd: string
  todos?: TodoStore
  skills?: ToolContextSkills
  spawnAgent?: (prompt: string) => Promise<string>
  exitPlan?: (plan: string) => Promise<void>
}
```

- [ ] **skill.ts:** `Skill` tool — params `{ name, args? }`; run returns `ctx.skills?.getBody(name, args) ?? 'Error: unknown skill <name>'`. Description tells the model that `/<name>` maps to this tool.
- [ ] **task.ts:** `Task` tool — params `{ description, prompt }`; run returns `await ctx.spawnAgent?.(prompt) ?? 'Error: subagents unavailable'`. Description: launches an isolated-context subagent that returns one concise report; use to keep exploration out of the main context.
- [ ] **exit-plan.ts:** `ExitPlanMode` tool — params `{ plan }`; run calls `await ctx.exitPlan?.(plan)` and returns `'Plan presented to the user for approval.'`
- [ ] **index.ts:** export `baseTools` (read/write/edit/bash/grep/glob/todo), `agentTools` (skill/task/exitPlan), `allTools = [...baseTools, ...agentTools]`. Keep `toolByName` over `allTools`.
- [ ] **Failing test:** Skill tool returns body from a fake `ctx.skills`; unknown skill returns error. Task tool returns the spawnAgent result. ExitPlanMode calls exitPlan and returns the approval message. `baseTools` excludes Task (no recursion); `allTools` includes it.
- [ ] Run pass; commit `feat(tools): Skill, Task, ExitPlanMode tools + context hooks`.

---

## Task 4: core — system prompt sections (memory, skills, plan mode)

**Files:** Modify `packages/core/src/system-prompt.ts`; Test extend `test/loop.test.ts`.

- [ ] **Extend `SystemPromptCtx`** with optional `memory?: string`, `skillListing?: string`, `planMode?: boolean`. Append, when present:
  - memory → `\n# Project memory\n${memory}`
  - skillListing → `\n${skillListing}`
  - planMode → `\nPLAN MODE: do not modify files or run mutating commands. Produce a plan, then call ExitPlanMode with it.`
- [ ] **Failing test:** with `planMode:true` the prompt contains `PLAN MODE`; with `memory:'X'` it contains `X`; with `skillListing:'- a: b'` it contains `- a: b`; length still < 6000 for a small memory.
- [ ] Run pass; commit `feat(core): system-prompt sections for memory, skills, plan mode`.

---

## Task 5: cli — memory loader + skill/subagent/plan wiring

**Files:** Create `packages/cli/src/memory.ts`; Test `test/memory.test.ts`; Modify `packages/cli/src/app.tsx`, `packages/cli/src/slash-handlers.ts` and its test.

- [ ] **memory.ts:** `loadMemory(cwd, home)` reads, in order, `~/.maestro/MAESTRO.md`, `~/CLAUDE.md`, `<cwd>/MAESTRO.md`, `<cwd>/CLAUDE.md`; returns the concatenation (missing files skipped). Test: round-trip with a temp dir.
- [ ] **slash-handlers.ts:** add to `SlashCtx`: `listSkills(): string[]`, `runSkill(name: string, args: string): Promise<string>`, `togglePlan(): boolean`. Add cases:
  - `skills` → `Skills: ${ctx.listSkills().join(', ') || '(none)'}`
  - `plan` → `Plan mode ${ctx.togglePlan() ? 'ON' : 'OFF'}.`
  - default (unknown builtin) → if it matches a skill name, `return ctx.runSkill(cmd.name, cmd.args)`, else `Unknown command`. (Pass the skill-name set in via `ctx`.)
  Update the test accordingly.
- [ ] **app.tsx wiring:**
  - On startup: `discoverSkills(defaultSkillRoots(os.homedir(), process.cwd()))` → `SkillRegistry`; `loadMemory(process.cwd(), os.homedir())`.
  - Pass `skills` (registry), `memory`, and `skillListing` into `buildSystemPrompt` and `ToolContext` (via `runTurn` — add `skills`/`spawnAgent`/`exitPlan`/`planMode` passthrough to `RunTurnOpts` mirroring `todos`).
  - `spawnAgent(prompt)`: create a fresh `ContextManager`, `cm2.add({role:'user',content:prompt})`, `runTurn({ provider, model, cm: cm2, tools: baseTools, systemPrompt, numCtx, mode })` and return the final text. (Uses `baseTools` → no nested Task.)
  - Plan toggle: a `planMode` state; when on, pass `mode:'plan'`. `exitPlan(plan)`: push the plan to the transcript and set `planMode=false`.
  - Slash: `/skills`, `/plan`, and `/<skillname>` (dispatch to the registry, inject the body as a user message then run a turn).
- [ ] **loop.ts:** add `skills?`, `spawnAgent?`, `exitPlan?`, `planMode?` to `RunTurnOpts`; pass them into the `ToolContext` built for `tool.run`; when `planMode` is set, force `mode='plan'`.
- [ ] **Manual smoke:** create `.maestro/skills/hello/SKILL.md`; run maestro; `/skills` lists it; `/hello` injects its body; `/plan` toggles; a Task call spawns a subagent.
- [ ] Run all tests + build; commit `feat(cli): memory, skill registry, subagent spawner, plan mode wiring`.

---

## Self-Review

- **Spec coverage:** Skills (Tasks 1–3, 5), subagents (Task tool T3 + spawner T5), plan mode (T3 ExitPlanMode + T4 prompt + T5 toggle/permission), memory (T5). Progressive disclosure = listing in system prompt (T4) + body-on-invoke (T3 Skill tool / T5 slash).
- **Type consistency:** `SkillMeta`/`SkillRegistry` (skills pkg) vs `ToolContextSkills`/`SkillRef` (tools pkg) are structurally compatible — the registry's `list()`/`getBody()` satisfy `ToolContextSkills`. `RunTurnOpts` gains `skills`/`spawnAgent`/`exitPlan`/`planMode` mirroring the Phase-2 `todos` passthrough.
- **Recursion guard:** subagents get `baseTools` (no Task).
- **Placeholders:** none.
