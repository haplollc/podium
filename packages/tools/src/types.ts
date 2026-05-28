import type { ToolSchema } from '@maestro/providers'

export interface ToolContext { cwd: string }

export interface Tool {
  schema: ToolSchema
  /** Returns a string result that is appended to the conversation as a tool message. */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>
}
