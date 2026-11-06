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

// Arguments that make an allowlisted binary run other programs or write files:
// fd --exec/-x/-X, rg --pre, sort -o/--output/--compress-program, tree -o,
// file -C (writes magic.mgc).
const UNSAFE_ARG: Record<string, RegExp> = {
  fd: /^(--exec(-batch)?(=.*)?|-[^-]*[xX].*)$/,
  rg: /^--pre(=.*)?$/,
  sort: /^(--output(=.*)?|--compress-program(=.*)?|-[^-]*o.*)$/,
  tree: /^-[^-]*o.*$/,
  file: /^-[^-]*C.*$/,
}
// `git branch` and `git remote` only list when given these arguments; a name,
// -D, -m, add, remove, set-url and the rest change the repository.
const SAFE_GIT_BRANCH_ARG = /^(-a|--all|-r|--remotes|-v|-vv|--verbose|-l|--list|--show-current|--merged|--no-merged|--no-color|--(sort|format|color)=.*)$/
const SAFE_GIT_REMOTE_SUB = new Set(['show', 'get-url'])

function isSafeGit(args: string[]): boolean {
  const i = args.findIndex(w => !w.startsWith('-'))
  if (i === -1 || !SAFE_GIT_SUB.has(args[i])) return false
  const sub = args[i]
  const rest = args.slice(i + 1)
  if (rest.some(a => /^--output(=|$)/.test(a))) return false   // diff/log/show --output=<file>
  if (sub === 'branch') return rest.every(a => SAFE_GIT_BRANCH_ARG.test(a))
  if (sub === 'remote') {
    const remoteSub = rest.find(a => !a.startsWith('-'))
    return remoteSub == null ? rest.every(a => a === '-v' || a === '--verbose') : SAFE_GIT_REMOTE_SUB.has(remoteSub)
  }
  return true
}

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
    const [bin, ...args] = seg.split(/\s+/)
    if (bin === 'git') return isSafeGit(args)
    if (!SAFE_BIN.has(bin)) return false
    const unsafe = UNSAFE_ARG[bin]
    if (unsafe && args.some(a => unsafe.test(a))) return false
    // uniq writes its result to a second file argument.
    if (bin === 'uniq' && args.filter(a => !a.startsWith('-')).length > 1) return false
    return true
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
