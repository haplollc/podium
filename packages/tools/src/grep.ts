import { execa } from 'execa'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const grepTool: Tool = {
  schema: {
    name: 'Grep',
    description: 'Search file contents with a regex (ripgrep when available). Returns matching lines with file:line.',
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
    const pattern = String(args.pattern)
    const target = args.path ? String(args.path) : '.'
    const glob = args.glob ? String(args.glob) : undefined

    if (await hasBinary('rg')) {
      const rgArgs = ['-n', pattern]
      if (glob) rgArgs.push('-g', glob)
      rgArgs.push(target)
      const r = await execa('rg', rgArgs, { cwd: ctx.cwd, reject: false })
      return truncateLines(r.stdout || '(no matches)', 100)
    }

    // grep fallback: --include uses glob semantics (rg's -g is not understood by grep).
    const grepArgs = ['-rn']
    if (glob) grepArgs.push(`--include=${glob}`)
    grepArgs.push(pattern, target)
    const r = await execa('grep', grepArgs, { cwd: ctx.cwd, reject: false })
    return truncateLines(r.stdout || '(no matches)', 100)
  },
}

async function hasBinary(cmd: string): Promise<boolean> {
  // `which` resolves real executables on PATH (not shell functions/aliases).
  const r = await execa('which', [cmd], { reject: false })
  return r.exitCode === 0 && r.stdout.trim().length > 0
}
