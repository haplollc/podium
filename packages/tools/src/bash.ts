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
    return truncateLines(`exit=${result.exitCode}\n${body}`, 200)
  },
}
