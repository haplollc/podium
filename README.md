<div align="center">

# ✦ Podium

### A local-model terminal coding agent — Claude Code's powers, 100% on your machine.

Agentic loop · tools · skills · plan mode · subagents · auto-compaction —
tuned for **small context windows** and **modest Macs**.

[![npm](https://img.shields.io/npm/v/podium-cli?color=cb3837&logo=npm)](https://www.npmjs.com/package/podium-cli)
[![Homebrew](https://img.shields.io/badge/brew-haplollc%2Ftap%2Fpodium-FBB040?logo=homebrew&logoColor=white)](https://github.com/haplollc/podium)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![platform](https://img.shields.io/badge/macOS-Apple%20Silicon-000000?logo=apple)](https://www.apple.com/mac/)
[![local-first](https://img.shields.io/badge/local-first%20·%20no%20cloud-22c55e)](#)

</div>

---

```
╭──────────────────────────────────────────────────────────────╮
│ ✦ Podium  ·  local-model coding agent                        │
│ qwen2.5-coder:14b  ·  ~/projects/acme-api                    │
│ type / for commands · /help for the list                     │
╰──────────────────────────────────────────────────────────────╯
› refactor the auth middleware to use async/await
  ⚙ Read(src/middleware/auth.js)
  ⚙ Edit(src/middleware/auth.js)
Done — converted the three callback chains to async/await and kept the
error semantics identical. Want me to run the tests?

⠹ Pondering…
▓▓▓░░░░░░░ 34% · 4.9k/14.4k
──────────────────────────────────────────────────────────────────
› /m
  /model      ← run, download, or delete a model
  /models
 ↑/↓ select · Tab complete · Enter run
──────────────────────────────────────────────────────────────────
```

## Why Podium?

Cloud coding agents are wonderful — until you're offline, on a private codebase,
rate-limited, or just don't want your source leaving the building. Podium gives you
the same agentic experience with a model running **entirely on your Mac**.

The hard part of "local" is that the models are smaller and the context windows are
tight. Podium is built around that constraint:

- 🧠 **Honest hardware fitting** — it only ever offers you models that will actually run,
  with 🟢/🟡/🔴 verdicts computed for *your* machine. No more OOM surprises.
- 🪶 **Tiny footprint by design** — a sub-1k-token system prompt, progressively-disclosed
  skills, capped tool output, and aggressive auto-compaction keep the window lean.
- 🔧 **Tool-calling that actually works** — many local models emit tool calls as plain
  text instead of using the native API. Podium's dual-path parser catches both, with
  bounded auto-repair, so the agent loop doesn't stall.
- ⚡ **Fast after the first token** — the model is pre-warmed on launch and kept resident,
  and responses stream out as they're generated.

## Install

**Available now** on [npm](https://www.npmjs.com/package/podium-cli) and via the
[Haplo Homebrew tap](https://github.com/haplollc/homebrew-tap):

```bash
# npm
npm install -g podium-cli

# Homebrew
brew install haplollc/tap/podium
```

Update anytime — it detects how you installed it:

```bash
podium update
```

### Requirements

- macOS (Apple Silicon), Node ≥ 20
- A local-model backend (any one):
  - **[Ollama](https://ollama.com)** — recommended · `brew install ollama && ollama serve`
  - **LM Studio** — start its local server (`localhost:1234`)
  - **MLX** — `mlx_lm.server` (`localhost:8080`)

## First run

```bash
podium
```

Podium detects your Mac's memory, shows **only the models that will run**, downloads
your pick with a progress bar, and drops you into a REPL with a live context meter.

```
╭──────────────────────────────────────────────────────────────╮
│ ✦ Podium setup  ·  pick, download, or delete a model         │
│ Machine  Apple M2 · 24 GB RAM  (≈16.8 GB usable for a model) │
│ Backend  Ollama ✓       runs 100% on your machine            │
│ 🟢 runs comfortably      tight   (8 too big for this Mac)    │
│ 🟢 Qwen2.5-Coder 7B       4.7 GB · ✓ installed               │
│ ❯ 🟢 Qwen2.5-Coder 14B      9 GB ★ recommended · ✓ installed │
│ 🟡 gpt-oss 20B             14 GB · ⤓ download                │
│ 🔴 Qwen3-Coder 30B         19 GB · ⤓ download                │
╰──────────────────────────────────────────────────────────────╯
```

## Features

| | |
|---|---|
| 🛠 **Tools** | Read · Write · Edit · Bash · Grep · Glob · TodoWrite — all output-capped for small contexts |
| 🧩 **Skills** | Claude Code-compatible `SKILL.md` with progressive disclosure. Ships with `commit`, `review`, `explain`, `test` — and reads your `~/.claude/skills` too |
| 🤖 **Subagents** | The `Task` tool spawns an isolated-context agent that returns one concise report — keeping exploration out of the main window |
| 📋 **Plan mode** | `/plan` flips to read-only; the agent investigates and proposes a plan before touching anything |
| 🎚 **Permission modes** | `default` · `acceptEdits` · `plan` · `yolo`, with interactive y/n approval prompts |
| 🧠 **Memory** | Hierarchical `PODIUM.md` / `CLAUDE.md` (user → project) |
| ✨ **SOUL.md** | Give Podium a personality/voice — per-project or global. It also **learns durable preferences** ("always be concise") and asks before saving them |
| ↩️ **Rewind** | `/rewind` jumps back to an earlier point in the conversation **and undoes the file changes** made since — pick a message, press Enter |
| 🪝 **Hooks** | `SessionStart` · `UserPromptSubmit` · `PreToolUse` · `PreCompact` from `~/.podium/settings.json` |
| 🌐 **Web** | `WebSearch` + `WebFetch` (website scanning) — and it tells you when you're offline instead of failing |
| 🔌 **Multi-backend** | Ollama · LM Studio · MLX behind one interface, auto-detected |

## In-session commands

Type `/` and a letter for an autocomplete dropdown.

| Command | What it does |
|---|---|
| `/setup` | Re-run the setup wizard |
| `/model` | Pick, **download**, or **delete** a model |
| `/models` | List installed models |
| `/pull <name>` | Download a model |
| `/skills` | List available skills |
| `/soul` | Show Podium's personality — `/soul <preference>` to add one, `/soul reset` to clear learned ones |
| `/plan` | Toggle plan mode (read-only) |
| `/context` | Show the context meter + token breakdown |
| `/compact` | Summarize + shrink the conversation now |
| `/rewind` | Step back to an earlier message and undo file changes since |
| `/clear` | Reset the conversation |
| `/<skill>` | Run a skill (e.g. `/commit`, `/review`) |

## Models

Podium ships a curated catalog spanning every RAM tier — and shows you exactly what
fits. A few highlights (full list in [`models/catalog.json`](./models/catalog.json)):

| Tier | Picks |
|---|---|
| **8 GB** | `granite4:micro-h` · `qwen2.5-coder:3b` · `smollm2:1.7b` |
| **16 GB** | `qwen2.5-coder:7b` · `granite4:tiny-h` · `qwen3:8b` · `phi4-mini` |
| **24 GB** | `qwen2.5-coder:14b` ★ · `gpt-oss:20b` |
| **32 GB** | `qwen3-coder:30b` · `glm-4.7-flash` · `devstral:24b` · `codestral:22b` |
| **64 GB** | `qwen3-coder-next` · `gpt-oss:120b` · `llama3.3:70b` |

## How it works

Podium is a pnpm/TypeScript monorepo of small, focused packages:

```
packages/
  hardware/   Mac memory detection + model-fit calculator (🟢/🟡/🔴)
  providers/  Ollama · LM Studio · MLX behind one Provider interface
  core/       agentic loop · context manager · compaction · tool-call parser
  tools/      Read/Write/Edit/Bash/Grep/Glob/TodoWrite + Skill/Task/ExitPlanMode
  skills/     SKILL.md parse + discovery + progressive-disclosure registry
  tui/        Ink/React — wizard, REPL, context meter, autocomplete
  cli/        the `podium` binary, config, slash commands, hooks
```

The **context manager** tracks a token budget per turn and auto-compacts (retained
prefix + summarize-the-tail) before the window fills. The **agentic loop** prefers native
function-calling but falls back to parsing text-emitted tool calls — the trick that makes
small local models usable as agents.

## Develop

```bash
git clone https://github.com/haplollc/podium
cd podium
pnpm install
pnpm -r build
pnpm test                       # 130+ unit tests
node packages/cli/bin/podium.js

# Live tests against a real model (needs Ollama + a pulled model):
PODIUM_LIVE=1 pnpm vitest run packages/cli/test/live.test.ts
```

## License

[MIT](./LICENSE) © Haplo LLC

<div align="center">
<sub>Built for people who want their coding agent to stay on their own machine.</sub>
</div>
