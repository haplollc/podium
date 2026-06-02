import type { ContextStats } from '@podium/core'
import type { SlashCommand } from '@podium/core'

export interface SlashCtx {
  stats(): ContextStats
  clear(): void
  compact(): Promise<string>
  openModelPicker(): void
  openSetup(): void
  listModels(): Promise<string[]>
  pull(model: string): Promise<void>
  listSkills(): string[]
  hasSkill(name: string): boolean
  runSkill(name: string, args: string): Promise<string>
  togglePlan(): boolean
  soul(): string
  toggleMetrics(): boolean
  toggleYolo(): boolean
}

const HELP = 'Commands: /setup · /model · /models · /pull <name> · /skills · /soul · /metrics · /plan · /yolo · /context · /compact · /clear · /help · /<skill>'

/** Execute a builtin slash command (or a /<skill-name>), returning a transcript line. */
export async function runSlash(cmd: SlashCommand, ctx: SlashCtx): Promise<string> {
  switch (cmd.name) {
    case 'help':
      return HELP
    case 'clear':
      ctx.clear()
      return 'Conversation cleared.'
    case 'context': {
      const s = ctx.stats()
      return `Context: ${Math.round(s.percentUsed * 100)}% · ${s.used}/${s.effective} tokens (window ${s.window})`
    }
    case 'compact':
      return await ctx.compact()
    case 'setup':
      ctx.openSetup()
      return 'Reopening setup…'
    case 'model':
      ctx.openModelPicker()
      return 'Opening model picker (download / delete / switch)…'
    case 'models':
      return `Installed: ${(await ctx.listModels()).join(', ') || '(none)'}`
    case 'pull':
      if (!cmd.args) return 'Usage: /pull <model>'
      await ctx.pull(cmd.args)
      return `Pulled ${cmd.args}.`
    case 'skills':
      return `Skills: ${ctx.listSkills().join(', ') || '(none)'}`
    case 'plan':
      return `Plan mode ${ctx.togglePlan() ? 'ON — read-only until you /plan again' : 'OFF'}.`
    case 'soul':
      return `Podium's soul (create SOUL.md to customize):\n${ctx.soul()}`
    case 'metrics':
      return `Metrics dashboard ${ctx.toggleMetrics() ? 'ON' : 'OFF'}.`
    case 'yolo':
      return ctx.toggleYolo()
        ? '⚠ YOLO ON — skipping ALL permission prompts. Tools run without asking. /yolo again to turn off.'
        : 'YOLO OFF — permission prompts restored.'
    default:
      if (ctx.hasSkill(cmd.name)) return ctx.runSkill(cmd.name, cmd.args)
      return `Unknown command: /${cmd.name}. Try /help`
  }
}
