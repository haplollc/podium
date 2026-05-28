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
