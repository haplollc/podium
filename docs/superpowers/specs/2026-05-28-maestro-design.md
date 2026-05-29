# Podium — Design Spec

**Date:** 2026-05-28
**Status:** Approved (design phase)

## 1. Summary

Podium is a terminal coding agent with Claude Code's feature set — agentic loop,
tools, skills, plan mode, subagents, slash commands, auto-compaction — running
**100% on local models**. It is optimized for **small context windows** and **modest
Macs**, with a hard floor of **16 GB** unified memory and an experimental/limited
tier for **8 GB** machines.

Invoked as `podium`. Installable via **npm** and **Homebrew**, with consistent
self-update.

## 2. Guiding principles

1. **Context is the scarcest resource.** Minimal system prompt (target <1k tokens),
   lazy tool schemas, progressive disclosure, aggressive auto-compaction, and
   externalization of state to files. We optimize tokens the way Claude Code
   optimizes for capability.
2. **Be honest about hardware.** Never offer a model that won't run. Every model in
   the picker shows a 🟢/🟡/🔴 fit verdict computed for *this* Mac.
3. **Small models fail at tool-calling differently.** Dual-path tool invocation:
   native function-calling when the model supports it, a constrained/parsed fallback
   when it doesn't, with auto-repair on malformed output.
4. **Claude Code compatibility where free.** Reuse the `SKILL.md` format, `CLAUDE.md`
   memory, and config conventions so the existing ecosystem transfers.

## 3. Architecture

Monorepo using pnpm workspaces. TypeScript/Node throughout.

```
podium/
  packages/
    core/        agentic loop, context manager, compaction, token budgeter
    providers/   backend abstraction: ollama | lmstudio | mlx adapters
    tools/       Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, WebFetch...
    skills/      SKILL.md loader + progressive disclosure
    tui/         Ink/React terminal UI (REPL, wizard, model picker, context meter)
    hardware/    Mac memory detection + model-fit calculator
    cli/         entrypoint `podium`, slash-command dispatch, config/memory
  models/        curated catalog (model -> sizes/quant -> RAM tiers -> capabilities)
```

Each package has one clear purpose, communicates through a well-defined interface,
and is independently testable.

## 4. Provider abstraction (multi-backend, day one)

A single `Provider` interface:

```ts
interface Provider {
  id: 'ollama' | 'lmstudio' | 'mlx'
  health(): Promise<HealthStatus>            // is the backend installed & running?
  listLocal(): Promise<LocalModel[]>          // models already downloaded
  pull(model: string, onProgress: (p: PullProgress) => void): Promise<void>
  capabilities(model: string): Promise<ModelCapabilities>  // tools? vision? ctx len
  chat(req: ChatRequest): AsyncIterable<ChatEvent>         // streaming text + tool calls
}
```

- **Ollama adapter** (default/recommended): native API — `GET /api/tags` (list),
  `POST /api/pull` (streaming download progress via `total`/`completed`),
  `POST /api/chat` (messages + `tools` + `options.num_ctx`), `POST /api/show`
  (`capabilities` array gates tool-calling; `model_info` gives param count + ctx len).
  Richest backend: handles download + capability detection natively.
- **LM Studio adapter**: OpenAI-compatible endpoint at `http://localhost:1234/v1`
  plus the `lms` CLI for model download/listing.
- **MLX adapter**: `mlx_lm.server` OpenAI-compatible endpoint at
  `http://localhost:8080/v1`; downloads pull from HuggingFace `mlx-community`.
  Fastest path on Apple Silicon.

On launch Podium auto-detects which backends are installed and running. If none,
the setup wizard guides installing one (recommends Ollama via `brew install ollama`).

## 5. Model management & hardware fitting

- `hardware/` reads `sysctl hw.memsize`, chip model, and core count. Computes
  **usable memory ≈ 0.7 × total**.
- A curated **model catalog** (`models/*.json`, updatable from the repo) maps each
  model + quantization to a weight-size estimate plus a KV-cache estimate at a default
  context length.
- **Fit verdict:** `weights + KV-cache + OS/runtime overhead (4–8 GB) ≤ usable?`
  - 🟢 **fits** — runs comfortably at the suggested context size
  - 🟡 **tight** — runs, but only with a reduced context window
  - 🔴 **won't run** — hidden by default (shown greyed-out on request)
- **RAM tiers** (defaults; catalog is the source of truth):
  - **8 GB** (experimental, limited tool-use): 3B Q4 — `qwen2.5-coder:3b`, `llama3.2:3b`
  - **16 GB** (floor): 7B Q4 — `qwen2.5-coder:7b`
  - **24 GB**: 14B Q4 — `qwen2.5-coder:14b`, or `gpt-oss:20b`
  - **32 GB+**: `qwen3-coder:30b` (MoE, ~3B active)
- **Tool-capability gating:** a 🟢-fit model lacking the `tools` capability is flagged
  "chat-only / parsed-tools" and routed to the fallback tool protocol (§7).

## 6. First-run setup wizard

Runs whenever no model is configured. Forced but friendly:

1. Detect backends. If none running, offer to install + start Ollama.
2. Show the **model picker**, filtered to this Mac, sorted by recommendation, each
   row showing fit verdict + download size + tool-capability badge.
3. If the chosen model isn't downloaded → `pull` it with a live progress bar.
   If already downloaded → select it.
4. Pick a default context size (auto-suggested from the fit math).
5. Drop into the REPL. Config persisted to `~/.podium/config.json`.

## 7. Agentic loop + tool-calling strategy

- Standard loop: assemble compact system prompt → send messages + tool schemas →
  execute tool calls (in parallel when independent) → append tool results → repeat
  until no more tool calls. A **permission gate** sits between model output and
  execution. Permission modes: `default`, `acceptEdits`, `plan`, `yolo`.
- **Dual-path tool invocation:**
  - *Native* function-calling when `capabilities` includes `tools`.
  - *Fallback* constrained text protocol when it does not: the model emits a fenced
    tool block (JSON), parsed by Podium, with Ollama `format` / llama.cpp grammar used
    to force valid structure where supported, plus an **auto-repair reprompt** on
    malformed output (bounded retries, then surface the error).
- **System prompt is intentionally minimal** (target <1k tokens). Everything else is
  progressively disclosed.

## 8. Tools (v1 set)

`Read, Write, Edit, Bash, Glob, Grep, TodoWrite, Task (subagent), WebFetch`, plus
`ExitPlanMode`, `AskUserQuestion`, `Skill`.

- Same discipline as Claude Code: Read-before-Write/Edit, uniqueness check on Edit,
  bias toward dedicated tools over shell.
- **All tool outputs are capped/paginated** for small-context survival: Read defaults
  to fewer lines, Bash output truncated with "… N more lines" markers, Grep/Glob
  results bounded.

## 9. Context management & auto-compaction (core differentiator)

- **Token budgeter** maintains a per-turn token estimate.
- **Context meter** always visible in the TUI, e.g. `▓▓▓░░ 62% · 4.9k/8k`.
- **Auto-compaction** triggers earlier than Claude Code given small windows — at
  `effective_window − buffer`, with a configurable percentage override.
- **Strategy:** retained-prefix + summarize-the-tail (incremental). The summary is
  structured: task / current state / files+snippets / decisions / next steps.
  Tool-result payloads are dropped/truncated first (largest, least valuable).
- **State externalization:** plan and todos live in files under `.podium/`, not in
  context. Subagents offload exploration so their churn never reaches the main window.
- Honors a `## Compact Instructions` block in `CLAUDE.md` / `PODIUM.md`.

## 10. Skills (Claude Code-compatible)

- Same `SKILL.md` format: YAML frontmatter (`name`, `description`, `allowed-tools`,
  `user-invocable`, `argument-hint`, `when_to_use`, …) + markdown body.
- Discovered from `~/.podium/skills`, `<project>/.podium/skills`, and (for
  compatibility) `~/.claude/skills`.
- **Progressive disclosure:** only `name` + `description` injected at startup via a
  system-reminder; the full body is loaded only on invocation. Essential for small
  context.
- Invoked via the `Skill` tool or a `/skill-name` slash command.

## 11. Slash commands

Built-ins handled by the CLI:
`/model` (re-pick or download a model), `/models` (list installed), `/pull <name>`,
`/backend` (switch Ollama/LM Studio/MLX), `/context` (meter + breakdown), `/compact`,
`/plan`, `/skills`, `/config`, `/clear`, `/help`, `/update`.

Custom commands are skill files with `$ARGUMENTS` / `$1` interpolation.

## 12. Subagents

The `Task` tool launches an **isolated-context** subagent (fresh context, returns one
concise report) — doubly valuable here because it keeps exploration out of the small
main window. Custom agents defined in `.podium/agents/*.md`. A `fork` variant inherits
the parent context when needed.

## 13. Plan mode & thinking

- `/plan` enters a read-only mode (only a plan file is writable). `ExitPlanMode`
  surfaces the plan for approval (reads from the plan file; no content argument).
- "Thinking" is rendered separately from final output. For models without a native
  thinking channel, a parsed `<think>` convention is used and thinking is kept **out of
  the persisted context** to save tokens.

## 14. Config & memory

- `~/.podium/config.json` — backend, model, context size, permission defaults.
- Layered `settings.json` (user → project) for permissions/env/hooks.
- Hierarchical memory: `PODIUM.md` / `CLAUDE.md` (user → project), loaded into the
  prompt tail.
- **Hooks (v1 subset):** `SessionStart`, `PreToolUse`, `PreCompact`,
  `UserPromptSubmit`. Not the full Claude Code lifecycle in v1.

## 15. Distribution & updates

- **npm:** `npm install -g podium-cli` (Node entrypoint).
- **Homebrew:** a tap — `brew install jaredcassoutt/tap/podium` — wrapping the npm
  package; the formula is auto-bumped from the repo on release.
- **Updates:** `podium update` self-updates (detects npm vs brew install). A startup
  version check notifies when a newer release is available.
- **Release pipeline:** GitHub Actions — tag → publish to npm → bump brew formula.

## 16. Build phases

- **Phase 1 — Vertical slice (runnable end-to-end):** hardware detection → Ollama
  adapter → setup wizard → model pick/pull → REPL → core tools
  (Read/Write/Edit/Bash/Grep/Glob) → native tool loop → basic auto-compaction →
  context meter.
- **Phase 2 — Robustness:** parsed-tool fallback + auto-repair, TodoWrite, permission
  modes, `/model` `/context` `/compact` commands, config persistence.
- **Phase 3 — Power features:** Skills (CC-compatible), subagents (`Task`), plan mode,
  `CLAUDE.md`/`PODIUM.md` memory.
- **Phase 4 — Reach:** LM Studio + MLX adapters, 8 GB tiny-model tier, hooks subset,
  npm + Homebrew distribution + auto-update.

## 17. Decisions & scope calls

- **8 GB tier is experimental/limited** — 3B models are weak at agentic tool-use, so
  it's scoped best-effort, not a first-class experience.
- **Hooks are a v1-minimal subset**, not Claude Code's full ~20-event lifecycle.
- **Ollama is the recommended default backend** because it natively handles download,
  progress, and tool-capability detection; LM Studio and MLX are first-class but their
  download UX is thinner.

## 18. Non-goals (v1)

- Cloud/hosted models (local-only by design).
- Full MCP server ecosystem (may come later; not in v1).
- Windows/Linux support (macOS / Apple Silicon first).
- The complete Claude Code hook lifecycle.
