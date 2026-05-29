import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'

export type HookEvent = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PreCompact'
interface HookCmd { command: string }
export type HookConfig = Partial<Record<HookEvent, HookCmd[]>>

/** Load command-hooks from ~/.podium/settings.json ({ "hooks": { "<Event>": [{ "command": "..." }] } }). */
export async function loadHooks(dir = path.join(os.homedir(), '.podium')): Promise<HookConfig> {
  try {
    const json = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'))
    return (json.hooks ?? {}) as HookConfig
  } catch {
    return {}
  }
}

/**
 * Run all command-hooks for an event. The JSON payload is passed on stdin.
 * For PreToolUse, returns false (deny) if any hook exits non-zero or prints
 * {"decision":"deny"}. Other events always return true.
 */
export async function runHooks(cfg: HookConfig, event: HookEvent, payload: unknown): Promise<boolean> {
  for (const h of cfg[event] ?? []) {
    const r = await execa(h.command, { shell: true, input: JSON.stringify(payload), reject: false })
    if (event === 'PreToolUse') {
      if (r.exitCode !== 0) return false
      try { if (JSON.parse(r.stdout)?.decision === 'deny') return false } catch { /* non-JSON output is allow */ }
    }
  }
  return true
}
