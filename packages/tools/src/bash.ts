import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const bashTool: Tool = {
  schema: {
    name: 'Bash',
    description: 'Run a shell command in the working directory. Avoid cat/grep/find/sed — use Read/Grep/Glob/Edit instead.',
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
    const result = await execa(String(args.command), {
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
