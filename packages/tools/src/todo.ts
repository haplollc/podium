import type { Tool, TodoItem } from './types.js'

const MARK: Record<TodoItem['status'], string> = {
  pending: '[ ]', in_progress: '[~]', completed: '[x]',
}

export const todoTool: Tool = {
  schema: {
    name: 'TodoWrite',
    description: 'Track a structured task list for multi-step work. Pass the FULL list every call (it replaces the previous one). Use for tasks of 3+ steps; mark one item in_progress at a time.',
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
