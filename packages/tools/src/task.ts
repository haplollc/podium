import type { Tool } from './types.js'

export const taskTool: Tool = {
  schema: {
    name: 'Task',
    description: 'Launch an isolated-context subagent to handle a focused, multi-step subtask (e.g. exploration). It has its own fresh context and returns a single concise report — use it to keep large intermediate results out of the main conversation.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'A 3-5 word label for the subtask' },
        prompt: { type: 'string', description: 'The full instructions for the subagent' },
      },
      required: ['description', 'prompt'],
    },
  },
  async run(args, ctx) {
    if (!ctx.spawnAgent) return 'Error: subagents are unavailable in this context.'
    return ctx.spawnAgent(String(args.prompt))
  },
}
