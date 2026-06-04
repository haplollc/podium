export interface SlashCommand { name: string; args: string }

export function parseSlash(input: string): SlashCommand | null {
  const t = input.trim()
  if (!t.startsWith('/')) return null
  const sp = t.indexOf(' ')
  if (sp === -1) return { name: t.slice(1), args: '' }
  return { name: t.slice(1, sp), args: t.slice(sp + 1).trim() }
}

export const BUILTIN_SLASH = ['model', 'models', 'pull', 'context', 'compact', 'rewind', 'tasks', 'clear', 'help'] as const
export type BuiltinSlash = typeof BUILTIN_SLASH[number]

export function isBuiltinSlash(name: string): name is BuiltinSlash {
  return (BUILTIN_SLASH as readonly string[]).includes(name)
}
