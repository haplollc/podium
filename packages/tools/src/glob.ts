import { glob as fsGlob } from 'node:fs/promises'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const globTool: Tool = {
  schema: {
    name: 'Glob',
    description: 'List files matching a glob pattern (e.g. **/*.ts), sorted by name.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Base dir; defaults to cwd' },
      },
      required: ['pattern'],
    },
  },
  async run(args, ctx) {
    const cwd = args.path ? String(args.path) : ctx.cwd
    const files: string[] = []
    for await (const entry of fsGlob(String(args.pattern), { cwd })) {
      files.push(typeof entry === 'string' ? entry : String(entry))
    }
    files.sort()
    return truncateLines(files.join('\n') || '(no matches)', 200)
  },
}
