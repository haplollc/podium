import type { ContextStats } from '@maestro/core'
import type { SlashCommand } from '@maestro/core'

export interface SlashCtx {
  stats(): ContextStats
  clear(): void
  compact(): Promise<void>
  openModelPicker(): void
  listModels(): Promise<string[]>
  pull(model: string): Promise<void>
}

const HELP = 'Commands: /model · /models · /pull <name> · /context · /compact · /clear · /help'

/** Execute a builtin slash command, returning a line to show in the transcript. */
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
    default:
      return `Unknown command: /${cmd.name}. Try /help`
  }
}
