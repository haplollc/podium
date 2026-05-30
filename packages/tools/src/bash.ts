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
    const cmd = String(args.command)
    const blocked = DANGEROUS.find((re) => re.test(cmd))
    if (blocked) {
      return `Refused: this command matches a blocked dangerous pattern (${blocked.source}). If you really need it, ask the user to run it manually.`
    }
    const result = await execa(cmd, {
      shell: true, cwd: ctx.cwd, timeout: Number(args.timeout_ms ?? 120000),
      reject: false, all: true, cancelSignal: ctx.signal,
    })
    if (result.isCanceled) return 'Stopped.'
    const body = result.all ?? `${result.stdout}\n${result.stderr}`
    let out = `exit=${result.exitCode}\n${body}`
    // Loud, actionable hint when a command runs a file that doesn't exist yet.
    if (result.exitCode !== 0 && /No such file or directory|can't open file|command not found|exit=127/i.test(out)) {
      out += '\n\n[hint] That file/command does not exist. If you meant to run a script, CREATE it first with the Write tool (e.g. Write todo.py with the program), THEN run it.'
    }
    return truncateLines(out, 200)
  },
}
