export interface SystemPromptCtx {
  cwd: string
  os: string
  toolNames: string[]
  memory?: string        // MAESTRO.md / CLAUDE.md content
  skillListing?: string  // progressive-disclosure skill list
  soul?: string          // personality / voice (SOUL.md)
  planMode?: boolean
}

export function buildSystemPrompt(ctx: SystemPromptCtx): string {
  const sections = [
    `You are Maestro, a terminal coding agent running on a local model.`,
    ...(ctx.soul ? [ctx.soul] : []),
    `Help with software tasks. Be concise; prefer doing over explaining.`,
    `Use the provided tools to read and change files and run commands. Prefer dedicated tools (Read/Edit/Grep/Glob) over shell equivalents (cat/sed/grep/find).`,
    `You MUST Read a file before you Write or Edit it. Make the smallest change that satisfies the request.`,
    `Call tools when you need to act. When the task is done, reply with a short result — no tool call.`,
    `Available tools: ${ctx.toolNames.join(', ')}.`,
  ]
  if (ctx.planMode) {
    sections.push(`PLAN MODE: do NOT modify files or run mutating commands. Investigate, then produce a plan and call ExitPlanMode with it for approval.`)
  }
  if (ctx.skillListing) sections.push(ctx.skillListing)
  if (ctx.memory) sections.push(`# Project memory\n${ctx.memory}`)
  sections.push(`Environment: cwd=${ctx.cwd}, os=${ctx.os}.`)
  return sections.join('\n')
}
