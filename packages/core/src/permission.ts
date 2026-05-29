export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'yolo'
export type PermissionDecision = 'allow' | 'ask' | 'deny'

const READ_ONLY = new Set(['Read', 'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'WebFetch'])
const EDIT_TOOLS = new Set(['Write', 'Edit'])

/** Decide how a tool invocation should be handled under a permission mode. */
export function decide(tool: string, mode: PermissionMode): PermissionDecision {
  if (READ_ONLY.has(tool)) return 'allow'   // read-only / non-fs tools never gate
  if (mode === 'yolo') return 'allow'
  if (mode === 'plan') return 'deny'         // no mutations in plan mode
  if (mode === 'acceptEdits') return EDIT_TOOLS.has(tool) ? 'allow' : 'ask'
  return 'ask'                               // default: ask for any mutation
}
