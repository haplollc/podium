import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const grepTool: Tool = {
  schema: {
    name: 'Grep',
    description: 'Search file contents with a regex (ripgrep). Returns matching lines with file:line.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Dir or file to search; defaults to cwd' },
        glob: { type: 'string', description: 'Optional file glob filter, e.g. *.ts' },
      },
      required: ['pattern'],
    },
  },
  async run(args, ctx) {
    const rgArgs = ['-n', String(args.pattern)]
    if (args.glob) rgArgs.push('-g', String(args.glob))
    rgArgs.push(args.path ? String(args.path) : '.')
    // Fall back to grep -rn if rg is unavailable.
    const bin = (await which('rg')) ? 'rg' : 'grep'
    if (bin === 'grep') rgArgs.unshift('-r')
    const r = await execa(bin, rgArgs, { cwd: ctx.cwd, reject: false })
    return truncateLines(r.stdout || '(no matches)', 100)
  },
}

async function which(cmd: string): Promise<boolean> {
  const r = await execa('which', [cmd], { reject: false })
  return r.exitCode === 0
}
