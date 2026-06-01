import { glob as fsGlob } from 'node:fs/promises'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

const MAX_MATCHES = 500   // stop walking early so a huge tree can't hang the agent
const IGNORE = /(^|\/)(node_modules|\.git|dist|build|\.next|\.venv|venv|__pycache__|\.cache)(\/|$)/

export const globTool: Tool = {
  schema: {
    name: 'Glob',
    description: 'List files matching a glob pattern (e.g. **/*.ts), sorted by name. Heavy dirs (node_modules, .git, dist, venv) are skipped and results are capped.',
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
    let capped = false
    for await (const entry of fsGlob(String(args.pattern), { cwd })) {
      const p = typeof entry === 'string' ? entry : String(entry)
      if (IGNORE.test(p)) continue                 // skip dependency/build dirs
      if (ctx.signal?.aborted) break
      files.push(p)
      if (files.length >= MAX_MATCHES) { capped = true; break }  // bound the walk
    }
    files.sort()
    const body = files.join('\n') || '(no matches)'
    const note = capped ? `\n… stopped at ${MAX_MATCHES} matches — narrow the pattern.` : ''
    return truncateLines(body, 200) + note
  },
}
