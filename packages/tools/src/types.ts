import type { ToolSchema } from '@podium/providers'

export interface TodoItem { content: string; status: 'pending' | 'in_progress' | 'completed' }
export interface TodoStore { set(items: TodoItem[]): void; get(): TodoItem[] }

/** A long-running shell process (e.g. a dev server) started in the background. */
export interface BgTask {
  id: number
  command: string
  startedAt: number
  status: 'running' | 'exited'
  exitCode?: number
  output: string        // capped tail of combined stdout+stderr
  url?: string          // detected localhost URL, if any
}
export interface BgTaskStore {
  /** Spawn `command` detached, track it, and return the task immediately. */
  start(command: string, cwd: string): BgTask
  list(): BgTask[]
  get(id: number): BgTask | undefined
  kill(id: number): boolean
  killAll(): void
}

export interface SkillRef { name: string; description: string }
export interface ToolContextSkills {
  list(): SkillRef[]
  getBody(name: string, args?: string): Promise<string | null>
}

export interface ToolContext {
  cwd: string
  /** Abort long-running tools (Bash, web) when the user stops the turn. */
  signal?: AbortSignal
  /** Snapshot a file's current content before modifying it (enables /rewind). */
  snapshot?: (absPath: string) => Promise<void>
  todos?: TodoStore
  /** Registry for background shell tasks (dev servers etc.) so they don't block a turn. */
  bgTasks?: BgTaskStore
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
