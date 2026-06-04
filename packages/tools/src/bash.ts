import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'
import { stringArg } from './args.js'

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

// Long-lived processes (dev servers, watchers) that would otherwise block the
// turn forever. These run in the background so the agent can keep working and
// hand the user a URL immediately.
const SERVER_RE = /\b(python3?\s+-m\s+http\.server|http-server|live-server|\bserve\b|vite\b|next\s+dev|nuxt\s+dev|webpack\s+serve|ng\s+serve|flask\s+run|rails\s+s(erver)?|php\s+-S|jekyll\s+serve|hugo\s+server|npm\s+(run\s+)?(dev|start)|pnpm\s+(run\s+)?(dev|start)|yarn\s+(dev|start))\b/i

export const bashTool: Tool = {
  schema: {
    name: 'Bash',
    description: 'Run a shell command in the working directory. Avoid cat/grep/find/sed — use Read/Grep/Glob/Edit instead. Never run a script you have not created yet: use the Write tool to create files before running them. For a long-running process like a dev server (e.g. python3 -m http.server), pass background:true so it does not block — you get a URL back immediately.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_ms: { type: 'number', description: 'Default 120000' },
        background: { type: 'boolean', description: 'Run as a long-lived background process (servers/watchers) and return immediately.' },
      },
      required: ['command'],
    },
  },
  async run(args, ctx) {
    let cmd = stringArg(args, ['command', 'cmd'], 'command')
    const blocked = DANGEROUS.find((re) => re.test(cmd))
    if (blocked) {
      return `Refused: this command matches a blocked dangerous pattern (${blocked.source}). If you really need it, ask the user to run it manually.`
    }
    // Many systems (incl. macOS) only ship `python3`, not `python` / `pip`.
    // Rewrite the bare command word so the agent's habitual `python …` just works.
    cmd = await normalizePython(cmd, ctx.cwd)

    // Run servers/watchers in the background so they don't hang the turn.
    const wantsBackground = Boolean(args.background) || SERVER_RE.test(cmd)
    if (wantsBackground && ctx.bgTasks) {
      const task = ctx.bgTasks.start(cmd, ctx.cwd)
      const where = task.url ? ` Open ${task.url}` : ''
      return `Started in the background as task #${task.id}: ${cmd}.${where}\nIt keeps running (shown in the footer) and is stopped when Podium exits. Do not run it again; if you need its logs, ask to check task #${task.id}.`
    }

    const result = await execa(cmd, {
      shell: true, cwd: ctx.cwd, timeout: Number(args.timeout_ms ?? 120000),
      reject: false, all: true, cancelSignal: ctx.signal,
    })
    if (result.isCanceled) return 'Stopped.'
    const body = result.all ?? `${result.stdout}\n${result.stderr}`
    let out = `exit=${result.exitCode}\n${body}`
    if (result.exitCode !== 0) {
      const missing = /(\w[\w.-]*): command not found/i.exec(out)?.[1] ?? (/exit=127/.test(out) ? 'that command' : undefined)
      if (missing) {
        out += `\n\n[hint] '${missing}' is not installed/on PATH. Use the correct binary name (e.g. python3 not python, pip3 not pip) or pick another approach. Do NOT rerun the same command.`
      } else if (/No such file or directory|can't open file/i.test(out)) {
        out += '\n\n[hint] That file does not exist yet. Create it with the Write tool first, then run it.'
      }
    }
    return truncateLines(out, 200)
  },
}
