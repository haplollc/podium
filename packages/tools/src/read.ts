import { readFile } from 'node:fs/promises'
import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

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
  async run(args) {
    const file = String(args.file_path)
    const max = Number(args.max_lines ?? DEFAULT_MAX_LINES)
    const raw = await readFile(file, 'utf8')
    const numbered = raw.split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n')
    return truncateLines(numbered, max)
  },
}
