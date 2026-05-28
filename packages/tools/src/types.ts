import type { ToolSchema } from '@maestro/providers'

export interface TodoItem { content: string; status: 'pending' | 'in_progress' | 'completed' }
export interface TodoStore { set(items: TodoItem[]): void; get(): TodoItem[] }

export interface ToolContext {
  cwd: string
  todos?: TodoStore
}

export interface Tool {
  schema: ToolSchema
  /** Returns a string result that is appended to the conversation as a tool message. */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>
}
