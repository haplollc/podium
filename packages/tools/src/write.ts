import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Tool } from './types.js'

export const writeTool: Tool = {
  schema: {
    name: 'Write',
    description: 'Write content to a file, overwriting it. Read the file first if it already exists.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['file_path', 'content'],
    },
  },
  async run(args, ctx) {
    const raw = String(args.file_path)
    const file = path.isAbsolute(raw) ? raw : path.resolve(ctx.cwd, raw)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, String(args.content))
    return `Wrote ${String(args.content).length} bytes to ${file}`
  },
}
