import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

/**
 * Hard-blocked command patterns. A small local model is easy to confuse or
 * prompt-inject (tool output is fed back into it), so we refuse the highest-impact
 * destructive / exfiltration / remote-exec patterns outright — even before the
 * permission prompt. This is a safety net, not a full sandbox.
 */
export const DANGEROUS: RegExp[] = [
  /\brm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*f|\brm\s+(-[a-z]*\s+)*-[a-z]*f[a-z]*r/i, // rm -rf / -fr
  /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\$HOME)(\s|$)/i,                            // rm -r / or ~
  /\b(mkfs|fdisk)\b/i,
  /\bdd\b[^\n]*\bof=\/dev\//i,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,                          // fork bomb
  /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i,                   // curl … | sh
  /\bchmod\s+-R\s+0*777\s+\//i,
  />\s*\/dev\/(sd|nvme|disk)/i,
  /\bsudo\s+rm\b/i,
]

async function onPath(bin: string): Promise<boolean> {
  const r = await execa('which', [bin], { reject: false })
  return r.exitCode === 0 && r.stdout.trim().length > 0
}

let pythonFix: { python: boolean; pip: boolean } | null = null

/** Rewrite bare `python`/`pip` command words to `python3`/`pip3` when only the 3-suffixed binary exists. */
export async function normalizePython(cmd: string, _cwd: string): Promise<string> {
  if (!/\bpip\b|\bpython\b/.test(cmd)) return cmd
  if (!pythonFix) {
    pythonFix = {
      python: !(await onPath('python')) && (await onPath('python3')),
      pip: !(await onPath('pip')) && (await onPath('pip3')),
    }
  }
  let out = cmd
  // command-position only: start, or after a shell separator/operator; not python3/pythonX.
  if (pythonFix.python) out = out.replace(/(^|[\s;&|(])python(?![\w.])/g, '$1python3')
  if (pythonFix.pip) out = out.replace(/(^|[\s;&|(])pip(?![\w.])/g, '$1pip3')
  return out
}

export const bashTool: Tool = {
  schema: {
    name: 'Bash',
    description: 'Run a shell command in the working directory. Avoid cat/grep/find/sed — use Read/Grep/Glob/Edit instead. Never run a script you have not created yet: use the Write tool to create files before running them.',
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
    let cmd = String(args.command)
    const blocked = DANGEROUS.find((re) => re.test(cmd))
    if (blocked) {
      return `Refused: this command matches a blocked dangerous pattern (${blocked.source}). If you really need it, ask the user to run it manually.`
    }
    // Many systems (incl. macOS) only ship `python3`, not `python` / `pip`.
    // Rewrite the bare command word so the agent's habitual `python …` just works.
    cmd = await normalizePython(cmd, ctx.cwd)

    const result = await execa(cmd, {
      shell: true, cwd: ctx.cwd, timeout: Number(args.timeout_ms ?? 120000),
      reject: false, all: true, cancelSignal: ctx.signal,
    })
    if (result.isCanceled) return 'Stopped.'
    const body = result.all ?? `${result.stdout}\n${result.stderr}`
    let out = `exit=${result.exitCode}\n${body}`
    if (result.exitCode !== 0) {
      const m = /(\w[\w.-]*): command not found/i.exec(out) || (/exit=127/.test(out) ? [, 'the command'] as RegExpExecArray : null)
      if (m) {
        out += `\n\n[hint] '${m[1]}' is not installed/on PATH. Use the correct binary name (e.g. python3 not python, pip3 not pip) or pick another approach. Do NOT rerun the same command.`
      } else if (/No such file or directory|can't open file/i.test(out)) {
        out += '\n\n[hint] That file does not exist yet. Create it with the Write tool first, then run it.'
      }
    }
    return truncateLines(out, 200)
  },
}
