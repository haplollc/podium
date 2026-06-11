export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'yolo'
export type PermissionDecision = 'allow' | 'ask' | 'deny'

const READ_ONLY = new Set(['Read', 'Grep', 'Glob', 'TodoWrite', 'WebSearch', 'WebFetch'])
const EDIT_TOOLS = new Set(['Write', 'Edit'])

// Read-only binaries that can't mutate state, so prompting for them is pure
// friction (`ls`, `git status`, …). Anything that writes, installs, or executes
// arbitrary code stays out.
const SAFE_BIN = new Set([
  'ls', 'pwd', 'echo', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'diff',
  'which', 'file', 'stat', 'du', 'df', 'tree', 'date', 'whoami', 'uname',
  'ps', 'printenv', 'basename', 'dirname', 'realpath', 'grep', 'rg', 'fd', 'mdfind',
])
const SAFE_GIT_SUB = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'blame', 'shortlog', 'ls-files', 'remote', 'describe',
])

/**
 * True when a Bash command is read-only and safe to run without prompting.
 * Conservative: any redirect/substitution/backgrounding, or any pipeline
 * segment whose binary isn't on the allowlist, falls back to asking.
 */
export function isSafeBashCommand(cmd: string): boolean {
  const c = cmd.trim()
  if (!c) return false
  // Redirects, command substitution, backticks, or env-var assignments → ask.
  if (/[<>`]|\$\(|^\s*\w+=/.test(c)) return false
  const segments = c.split(/\|\||&&|[|;&\n]/).map(s => s.trim())
  if (segments.some(s => !s)) return false   // empty segment (e.g. trailing '&')
  return segments.every(seg => {
    const words = seg.split(/\s+/)
    if (words[0] === 'git') {
      const sub = words.slice(1).find(w => !w.startsWith('-'))
      return sub != null && SAFE_GIT_SUB.has(sub)
    }
    return SAFE_BIN.has(words[0])
  })
}

/** Decide how a tool invocation should be handled under a permission mode. */
export function decide(tool: string, mode: PermissionMode): PermissionDecision {
  if (READ_ONLY.has(tool)) return 'allow'   // read-only / non-fs tools never gate
  if (mode === 'yolo') return 'allow'
  if (mode === 'plan') return 'deny'         // no mutations in plan mode
  if (mode === 'acceptEdits') return EDIT_TOOLS.has(tool) ? 'allow' : 'ask'
  return 'ask'                               // default: ask for any mutation
}

/**
 * Like decide(), but argument-aware: a read-only Bash command (ls, git status…)
 * is auto-allowed outside plan mode instead of prompting every time.
 */
export function decideCall(
  call: { name: string; arguments: Record<string, unknown> },
  mode: PermissionMode,
): PermissionDecision {
  if (
    call.name === 'Bash' && mode !== 'plan' &&
    isSafeBashCommand(String(call.arguments?.command ?? call.arguments?.cmd ?? ''))
  ) return 'allow'
  return decide(call.name, mode)
}
