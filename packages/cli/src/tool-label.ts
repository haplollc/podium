import type { ToolCall } from '@podium/providers'

function base(p: unknown): string {
  const s = String(p ?? '')
  return s.split('/').filter(Boolean).pop() ?? s
}

function clip(s: unknown, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Human-friendly one-line label for a tool call (no raw JSON / file contents). */
export function toolLabel(call: ToolCall): string {
  const a = call.arguments ?? {}
  switch (call.name) {
    case 'Bash': return `Bash › ${clip(a.command, 64)}`
    case 'Read': return `Read › ${base(a.file_path)}`
    case 'Write': return `Write › ${base(a.file_path)}`
    case 'Edit': return `Edit › ${base(a.file_path)}`
    case 'Grep': return `Grep › ${clip(a.pattern, 40)}${a.glob ? ` in ${a.glob}` : ''}`
    case 'Glob': return `Glob › ${clip(a.pattern, 40)}`
    case 'WebSearch': return `WebSearch › ${clip(a.query, 50)}`
    case 'WebFetch': return `WebFetch › ${clip(a.url, 60)}`
    case 'TodoWrite': return `TodoWrite › ${Array.isArray(a.todos) ? a.todos.length : 0} items`
    case 'Task': return `Task › ${clip(a.description ?? a.prompt, 50)}`
    case 'Skill': return `Skill › ${clip(a.name, 40)}`
    case 'ExitPlanMode': return 'ExitPlanMode'
    default: return call.name
  }
}
