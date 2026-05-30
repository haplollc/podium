import type { ToolCall } from '@podium/providers'

function base(p: unknown): string {
  const s = String(p ?? '')
  return s.split('/').filter(Boolean).pop() ?? s
}

function fileArg(a: Record<string, unknown>): unknown {
  return a.file_path ?? a.path ?? a.file
}

function commandArg(a: Record<string, unknown>): unknown {
  return a.command ?? a.cmd
}

function clip(s: unknown, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Present-tense status line describing what the agent is doing right now. */
export function toolActivity(call: ToolCall): string {
  const a = call.arguments ?? {}
  switch (call.name) {
    case 'Read': return `Reading ${base(fileArg(a))}`
    case 'Write': return `Writing ${base(fileArg(a))}`
    case 'Edit': return `Editing ${base(fileArg(a))}`
    case 'Bash': return `Running ${clip(commandArg(a), 40)}`
    case 'Grep': return `Searching the code`
    case 'Glob': return `Finding files`
    case 'WebSearch': return `Searching the web for ${clip(a.query, 36)}`
    case 'WebFetch': return `Reading ${clip(a.url, 40)}`
    case 'TodoWrite': return `Updating the to-do list`
    case 'Task': return `Delegating to a subagent`
    case 'Skill': return `Running the ${clip(a.name, 24)} skill`
    case 'ExitPlanMode': return `Finalizing the plan`
    default: return `Using ${call.name}`
  }
}

/** Human-friendly one-line label for a tool call (no raw JSON / file contents). */
export function toolLabel(call: ToolCall): string {
  const a = call.arguments ?? {}
  switch (call.name) {
    case 'Bash': return `Bash › ${clip(commandArg(a), 64)}`
    case 'Read': return `Read › ${base(fileArg(a))}`
    case 'Write': return `Write › ${base(fileArg(a))}`
    case 'Edit': return `Edit › ${base(fileArg(a))}`
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

/** Friendly, persistent progress note before a tool runs. */
export function toolStartNote(call: ToolCall): string {
  const a = call.arguments ?? {}
  switch (call.name) {
    case 'Read': return `Hmm, let me open ${base(fileArg(a))} and see what is in there.`
    case 'Glob': return `Hmm, let me check the folder structure for matching files.`
    case 'Grep': return `I am searching the code for "${clip(a.pattern, 48)}" now.`
    case 'Write': return `Now I am writing ${base(fileArg(a))}.`
    case 'Edit': return `Now I am updating ${base(fileArg(a))}.`
    case 'Bash': return `I am running ${clip(commandArg(a), 64)} now.`
    case 'WebSearch': return `I am looking up "${clip(a.query, 54)}" on the web.`
    case 'WebFetch': return `I found a page to inspect, so I am reading ${clip(a.url, 60)}.`
    case 'TodoWrite': return `I am updating the checklist so the work stays organized.`
    case 'Task': return `I am sending a focused subtask off to a fresh context.`
    case 'Skill': return `I am loading the ${clip(a.name, 32)} skill instructions.`
    case 'ExitPlanMode': return `I have a plan ready, so I am handing it back for approval.`
    default: return `I am using ${call.name} now.`
  }
}

/** Short result note after a tool returns, based only on observable output. */
export function toolResultNote(call: ToolCall, result: string): string {
  const a = call.arguments ?? {}
  const trimmed = result.trim()
  const lineCount = trimmed ? trimmed.split('\n').filter(Boolean).length : 0
  const noMatches = /\(no matches\)|No results/i.test(trimmed)
  const failure = /^(Error|Refused|Blocked|Permission denied):/i.test(trimmed)
  if (failure) return `That did not complete: ${clip(trimmed, 120)}`
  switch (call.name) {
    case 'Read':
      return `Okay, I read ${base(fileArg(a))}${lineCount ? ` (${lineCount} lines shown)` : ''}.`
    case 'Glob':
      return noMatches ? `I did not find matching files there.` : `Okay, I found ${lineCount} matching file${lineCount === 1 ? '' : 's'}.`
    case 'Grep':
      return noMatches ? `I did not find matches for that search.` : `Okay, I found ${lineCount} matching line${lineCount === 1 ? '' : 's'}.`
    case 'Write':
      return `Okay, ${base(fileArg(a))} is written.`
    case 'Edit':
      return `Okay, ${base(fileArg(a))} is updated.`
    case 'Bash': {
      const exit = /^exit=(\d+)/m.exec(trimmed)?.[1]
      if (exit === '0') return `Okay, that command finished successfully.`
      if (exit) return `That command exited with ${exit}, so I will use that signal to adjust.`
      return `Okay, the command returned output.`
    }
    case 'WebSearch':
      return webSearchNote(trimmed, lineCount, noMatches)
    case 'WebFetch':
      return `Okay, I read the page and have the relevant text available.`
    case 'TodoWrite':
      return `Checklist updated.`
    case 'Task':
      return `The subagent reported back.`
    case 'Skill':
      return `Okay, the skill instructions are loaded.`
    case 'ExitPlanMode':
      return `Plan presented for approval.`
    default:
      return `${call.name} finished.`
  }
}

function countNumberedResults(text: string): number {
  return text.split('\n').filter(line => /^\d+\.\s/.test(line)).length
}

function webSearchNote(trimmed: string, lineCount: number, noMatches: boolean): string {
  if (noMatches) return `I did not find web results for that search.`
  const count = countNumberedResults(trimmed) || lineCount
  return `Okay, I found ${count} web result${count === 1 ? '' : 's'} to work from.`
}
