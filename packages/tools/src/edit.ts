import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Tool } from './types.js'

export const editTool: Tool = {
  schema: {
    name: 'Edit',
    description: 'Replace an exact unique string in a file. old_string must appear exactly once unless replace_all is true.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  async run(args, ctx) {
    const raw = String(args.file_path)
    const file = path.isAbsolute(raw) ? raw : path.resolve(ctx.cwd, raw)
    const oldS = String(args.old_string)
    const newS = String(args.new_string)
    const replaceAll = Boolean(args.replace_all)
    const content = await readFile(file, 'utf8')
    const count = content.split(oldS).length - 1
    if (count === 0) throw new Error(`old_string not found in ${file}`)
    if (count > 1 && !replaceAll) throw new Error(`old_string is not unique (${count} matches); pass replace_all or add context`)
    const updated = replaceAll ? content.split(oldS).join(newS) : content.replace(oldS, newS)
    await writeFile(file, updated)
    return `Edited ${file} (${replaceAll ? count : 1} replacement${replaceAll && count > 1 ? 's' : ''})`
  },
}
