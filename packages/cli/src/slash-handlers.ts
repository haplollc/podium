import type { ContextStats } from '@maestro/core'
import type { SlashCommand } from '@maestro/core'

export interface SlashCtx {
  stats(): ContextStats
  clear(): void
  compact(): Promise<void>
  openModelPicker(): void
  listModels(): Promise<string[]>
  pull(model: string): Promise<void>
  listSkills(): string[]
  hasSkill(name: string): boolean
  runSkill(name: string, args: string): Promise<string>
  togglePlan(): boolean
}

const HELP = 'Commands: /model · /models · /pull <name> · /skills · /plan · /context · /compact · /clear · /help · /<skill>'

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
      await ctx.compact()
      return 'Compacted conversation.'
    case 'model':
      ctx.openModelPicker()
      return 'Opening model picker…'
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
    default:
      if (ctx.hasSkill(cmd.name)) return ctx.runSkill(cmd.name, cmd.args)
      return `Unknown command: /${cmd.name}. Try /help`
  }
}
