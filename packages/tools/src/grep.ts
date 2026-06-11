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
    const pattern = String(args.pattern)
    const target = args.path ? String(args.path) : '.'
    const glob = args.glob ? String(args.glob) : undefined

    const rg = await resolveRg()
    if (rg) {
      const rgArgs = ['-n', pattern]
      if (glob) rgArgs.push('-g', glob)
      rgArgs.push(target)
      const r = await execa(rg, rgArgs, { cwd: ctx.cwd, reject: false })
      return truncateLines(r.stdout || '(no matches)', 100)
    }

    // grep fallback: --include uses glob semantics (rg's -g is not understood by grep).
    // Exclude dependency/VCS dirs by hand — plain grep doesn't honor .gitignore.
    const grepArgs = ['-rn', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist']
    if (glob) grepArgs.push(`--include=${glob}`)
    grepArgs.push(pattern, target)
    const r = await execa('grep', grepArgs, { cwd: ctx.cwd, reject: false })
    return truncateLines(r.stdout || '(no matches)', 100)
  },
}

// Resolution order: system rg on PATH (user's version/config), then the binary
// bundled with @vscode/ripgrep, then null → plain grep. Cached: PATH doesn't
// change mid-session, so don't spawn `which` on every search.
let rgPromise: Promise<string | null> | null = null

function resolveRg(): Promise<string | null> {
  if (!rgPromise) {
    rgPromise = (async () => {
      // `which` resolves real executables on PATH (not shell functions/aliases).
      const w = await execa('which', ['rg'], { reject: false })
      if (w.exitCode === 0 && w.stdout.trim()) return 'rg'
      try {
        const mod = await import('@vscode/ripgrep') as { rgPath?: string; default?: { rgPath?: string } }
        return mod.rgPath ?? mod.default?.rgPath ?? null
      } catch {
        return null
      }
    })()
  }
  return rgPromise
}
