import { writeFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Tool } from './types.js'
import { diffSummary } from './diff.js'
import { stringArg } from './args.js'

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
    const raw = stringArg(args, ['file_path', 'path', 'file'], 'file_path')
    const file = path.isAbsolute(raw) ? raw : path.resolve(ctx.cwd, raw)
    const before = await readFile(file, 'utf8').catch(() => '')
    const content = stringArg(args, ['content', 'text'], 'content')
    // Guard against the common small-model failure of calling Write before the
    // content is ready: don't silently create an empty file (it makes the model
    // loop). Refuse with an actionable message instead.
    if (content.trim() === '') {
      return `Error: Write was called with empty content for ${path.basename(file)}. Call Write again with the FULL file contents in the "content" field. (To create a deliberately empty file, use Bash: touch ${path.basename(file)}.)`
    }
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
    const verb = before ? 'Updated' : 'Created'
    return `${verb} ${path.basename(file)}\n${diffSummary(before, content, path.basename(file))}`
  },
}
