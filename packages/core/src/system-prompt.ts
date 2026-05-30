export interface SystemPromptCtx {
  cwd: string
  os: string
  toolNames: string[]
  memory?: string        // PODIUM.md / CLAUDE.md content
  skillListing?: string  // progressive-disclosure skill list
  soul?: string          // personality / voice (SOUL.md)
  planMode?: boolean
}

export function buildSystemPrompt(ctx: SystemPromptCtx): string {
  // Lean, positive, routing-oriented. Tool-specific caveats (internet access,
  // create-before-run, todo discipline) live in each tool's description, where
  // the model sees them in context — keeping this prompt short and uncontradicted,
  // which small models follow far more reliably.
  const sections = [
    `You are Podium, a terminal coding agent that works by calling tools.`,
    ...(ctx.soul ? [ctx.soul] : []),
    `To act, call a tool — do not just describe what you will do. When the task is finished, give a brief final answer with no tool call.`,
    `Prefer dedicated tools over shell: Read/Write/Edit for files, Grep/Glob to search, Bash only for running commands. Read a file before you Edit it. Make the smallest change that satisfies the request.`,
    `Available tools: ${ctx.toolNames.join(', ')}.`,
  ]
  if (ctx.planMode) {
    sections.push(`PLAN MODE: investigate only — do not modify files or run mutating commands. Produce a plan, then call ExitPlanMode.`)
  }
  if (ctx.skillListing) sections.push(ctx.skillListing)
  if (ctx.memory) sections.push(`# Project memory\n${ctx.memory}`)
  sections.push(`Environment: cwd=${ctx.cwd}, os=${ctx.os}.`)
  return sections.join('\n')
}
