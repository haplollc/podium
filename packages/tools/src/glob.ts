import { glob as fsGlob } from 'node:fs/promises'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

const MAX_MATCHES = 500     // stop once we have plenty of matches
const MAX_SCAN = 20000      // hard bound on entries examined so a huge tree can't hang the agent
const IGNORE = /(^|\/)(node_modules|\.git|dist|build|\.next|\.venv|venv|__pycache__|\.cache|Library)(\/|$)/

export const globTool: Tool = {
  schema: {
    name: 'Glob',
    description:
      'Find files matching a glob pattern (e.g. src/**/*.ts), relative to the working dir, sorted by name. ' +
      'Use a NARROW pattern aimed at what you want — e.g. **/*resume*.pdf — never list the whole tree with **/*. ' +
      'Patterns are case-sensitive (use a bracket like [Rr]esume to match either case). ' +
      'Heavy dirs (node_modules, .git, dist, venv, Library) are skipped and results are capped. ' +
      'On macOS, to find a user file by name anywhere fast, prefer Bash + Spotlight: mdfind -name resume.',
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
    let scanned = 0
    // `exclude` prunes traversal so we never descend into dependency/build dirs;
    // MAX_SCAN is a backstop in case a pattern still fans out enormously.
    const iter = fsGlob(String(args.pattern), {
      cwd,
      exclude: (p: string) => IGNORE.test(String(p)),
    })
    for await (const entry of iter) {
      if (ctx.signal?.aborted) break
      if (++scanned > MAX_SCAN) { capped = true; break }
      const p = typeof entry === 'string' ? entry : String(entry)
      if (IGNORE.test(p)) continue                 // belt-and-suspenders if exclude only filters
      files.push(p)
      if (files.length >= MAX_MATCHES) { capped = true; break }
    }
    files.sort()
    const body = files.join('\n') || '(no matches)'
    const note = capped
      ? `\n… capped (scanned ${scanned}) — use a narrower pattern, or on macOS try Bash: mdfind -name <word>.`
      : ''
    return truncateLines(body, 200) + note
  },
}
