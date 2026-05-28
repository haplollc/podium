import type { ToolSchema } from '@maestro/providers'

export interface TodoItem { content: string; status: 'pending' | 'in_progress' | 'completed' }
export interface TodoStore { set(items: TodoItem[]): void; get(): TodoItem[] }

export interface SkillRef { name: string; description: string }
export interface ToolContextSkills {
  list(): SkillRef[]
  getBody(name: string, args?: string): Promise<string | null>
}

export interface ToolContext {
  cwd: string
  todos?: TodoStore
  skills?: ToolContextSkills
  /** Launch an isolated-context subagent; returns its concise final report. */
  spawnAgent?: (prompt: string) => Promise<string>
  /** Surface a finished plan to the user for approval and leave plan mode. */
  exitPlan?: (plan: string) => Promise<void>
}

export interface Tool {
  schema: ToolSchema
  /** Returns a string result that is appended to the conversation as a tool message. */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>
}
