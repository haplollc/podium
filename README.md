# Maestro

A local-model terminal coding agent — Claude Code's feature set (agentic loop, tools,
skills, plan mode, subagents, slash commands, auto-compaction) running **100% on local
models**, optimized for **small context windows** and **modest Macs** (16 GB floor,
8 GB experimental tier).

## Install

```bash
# npm
npm install -g maestro-cli

# Homebrew
brew install jaredcassoutt/tap/maestro
```

Update any time with:

```bash
maestro update      # detects npm vs Homebrew automatically
```

## Requirements

- macOS (Apple Silicon), Node ≥ 20
- A local-model backend, any of:
  - **[Ollama](https://ollama.com)** (recommended) — `brew install ollama && ollama serve`
  - **LM Studio** — start its local server (`http://localhost:1234`)
  - **MLX** — `mlx_lm.server` (`http://localhost:8080`)

## First run

```bash
maestro
```

Maestro detects your Mac's memory, shows **only models that will actually run** (with
🟢/🟡/🔴 fit verdicts), downloads your pick with a progress bar, and drops you into a
REPL with a live context meter.

## In-session commands

```
/model            re-pick or download a model
/models           list installed models
/pull <name>      download a model
/skills           list available skills
/plan             toggle plan mode (read-only until you're ready)
/context          show the context meter + token breakdown
/compact          summarize + shrink the conversation now
/clear            reset the conversation
/help             list commands
/<skill-name>     run a skill (Claude Code-compatible SKILL.md)
```

## Features

- **Honest hardware fitting** — never offers a model that won't run on your machine.
- **Dual-path tool calling** — native function-calling plus a parsed-text fallback for
  small models that emit tool calls as JSON text, with bounded auto-repair.
- **Aggressive context management** — token budgeter, live meter, retained-prefix +
  summarize-tail auto-compaction tuned for small windows.
- **Permission modes** — `default` / `acceptEdits` / `plan` / `yolo`, with interactive
  approval prompts.
- **Skills** — Claude Code-compatible `SKILL.md` with progressive disclosure (also reads
  `~/.claude/skills`).
- **Subagents** — the `Task` tool spawns isolated-context agents that return one report.
- **Memory** — hierarchical `MAESTRO.md` / `CLAUDE.md`.
- **Hooks** — `SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PreCompact` from
  `~/.maestro/settings.json`.

## Develop

```bash
pnpm install
pnpm -r build
pnpm test
node packages/cli/bin/maestro.js

# Live tests against a real model (requires Ollama + a pulled model):
MAESTRO_LIVE=1 pnpm vitest run packages/cli/test/live.test.ts
```

## License

MIT
