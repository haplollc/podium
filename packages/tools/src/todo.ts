import type { Tool, TodoItem } from './types.js'

const MARK: Record<TodoItem['status'], string> = {
  pending: '[ ]', in_progress: '[~]', completed: '[x]',
}

export const todoTool: Tool = {
  schema: {
    name: 'TodoWrite',
    description: 'Track a structured task list for multi-step work (3+ steps). Pass the FULL list every call (it replaces the previous one); mark one item in_progress at a time. This only TRACKS progress — it does NOT perform any step. To create a file you must call Write; to run something you must call Bash. Do not mark an item completed unless you actually did it with the real tool.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
  async run(args, ctx) {
    const items = (Array.isArray(args.todos) ? args.todos : []) as TodoItem[]
    ctx.todos?.set(items)
    return items.map(t => `${MARK[t.status] ?? '[ ]'} ${t.content}`).join('\n') || '(no todos)'
  },
}
