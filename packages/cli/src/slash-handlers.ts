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
  updateSoul(text: string): Promise<void>
  resetSoul(): Promise<void>
  tasksReport(): string
  killTask(arg: string): string
  toggleMetrics(): boolean
  toggleYolo(): boolean
  /** Open the rewind picker; returns a message if it can't (else null = opened). */
  openRewind(): string | null
  /** Restore the last saved session for this project; returns a status line. */
  resume(): Promise<string>
  /** Quit podium (frees the model); returns the goodbye line shown before exit. */
  exit(): string
}

const HELP = 'Commands: /setup · /model · /models · /pull <name> · /skills · /soul · /metrics · /plan · /yolo · /context · /compact · /resume · /rewind · /tasks · /clear · /exit · /help · /<skill>'

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
    case 'resume':
      return await ctx.resume()
    case 'exit':
    case 'quit':
      return ctx.exit()
    case 'rewind':
      return ctx.openRewind() ?? 'Opening rewind…'
    case 'tasks': {
      const arg = cmd.args.trim()
      if (arg.startsWith('kill')) return ctx.killTask(arg.replace(/^kill\s*/, ''))
      return ctx.tasksReport()
    }
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
    case 'soul': {
      const arg = cmd.args.trim()
      if (!arg)
        return `Podium's soul (edit SOUL.md, or /soul <preference> to add · /soul reset to clear learned ones):\n${ctx.soul()}`
      if (arg.toLowerCase() === 'reset') {
        await ctx.resetSoul()
        return 'Soul reset to its base voice — learned preferences cleared.'
      }
      await ctx.updateSoul(arg)
      return `✎ Added to my soul: "${arg}"`
    }
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
