export { truncateLines } from './truncate.js'
export type { Tool, ToolContext } from './types.js'

import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import type { Tool } from './types.js'

export { readTool } from './read.js'
export { writeTool } from './write.js'
export { editTool } from './edit.js'
export { bashTool } from './bash.js'
export { grepTool } from './grep.js'
export { globTool } from './glob.js'

export const allTools: Tool[] = [readTool, writeTool, editTool, bashTool, grepTool, globTool]

export function toolByName(name: string): Tool | undefined {
  return allTools.find(t => t.schema.name === name)
}
