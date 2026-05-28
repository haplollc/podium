export { truncateLines } from './truncate.js'
export type { Tool, ToolContext, TodoItem, TodoStore, SkillRef, ToolContextSkills } from './types.js'

import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import { todoTool } from './todo.js'
import { skillTool } from './skill.js'
import { taskTool } from './task.js'
import { exitPlanTool } from './exit-plan.js'
import type { Tool } from './types.js'

export { readTool } from './read.js'
export { writeTool } from './write.js'
export { editTool } from './edit.js'
export { bashTool } from './bash.js'
export { grepTool } from './grep.js'
export { globTool } from './glob.js'
export { todoTool } from './todo.js'
export { skillTool } from './skill.js'
export { taskTool } from './task.js'
export { exitPlanTool } from './exit-plan.js'

/** Tools a subagent gets — excludes Task (no nested-subagent recursion). */
export const baseTools: Tool[] = [readTool, writeTool, editTool, bashTool, grepTool, globTool, todoTool]

/** Tools that orchestrate the agent itself (need ToolContext hooks). */
export const agentTools: Tool[] = [skillTool, taskTool, exitPlanTool]

export const allTools: Tool[] = [...baseTools, ...agentTools]

export function toolByName(name: string): Tool | undefined {
  return allTools.find(t => t.schema.name === name)
}
