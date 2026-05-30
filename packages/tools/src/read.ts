import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'
import { stringArg } from './args.js'

const DEFAULT_MAX_LINES = 250 // small-context default

export const readTool: Tool = {
  schema: {
    name: 'Read',
    description: 'Read a file from disk. Returns line-numbered content. Use an absolute path.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        max_lines: { type: 'number', description: `Max lines (default ${DEFAULT_MAX_LINES})` },
      },
      required: ['file_path'],
    },
  },
  async run(args, ctx) {
    const raw0 = stringArg(args, ['file_path', 'path', 'file'], 'file_path')
    const file = path.isAbsolute(raw0) ? raw0 : path.resolve(ctx.cwd, raw0)
    const max = Number(args.max_lines ?? DEFAULT_MAX_LINES)
    const raw = await readFile(file, 'utf8')
    const numbered = raw.split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n')
    return truncateLines(numbered, max)
  },
}
