import { parse as parseYaml } from 'yaml'
import type { ParsedSkill } from './types.js'

export function parseSkill(content: string): ParsedSkill {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!m) throw new Error('SKILL.md missing YAML frontmatter')
  const fm = (parseYaml(m[1]) ?? {}) as Record<string, unknown>
  const name = String(fm.name ?? '')
  const description = String(fm.description ?? '')
  if (!name || !description) throw new Error('SKILL.md frontmatter needs name and description')
  const allowed = fm['allowed-tools'] ?? fm.allowedTools
  return {
    name,
    description,
    whenToUse: fm.when_to_use ? String(fm.when_to_use) : undefined,
    allowedTools: Array.isArray(allowed) ? allowed.map(String) : undefined,
    userInvocable: fm['user-invocable'] !== false,
    argumentHint: fm['argument-hint'] ? String(fm['argument-hint']) : undefined,
    body: m[2].trim(),
  }
}

/** Replace $ARGUMENTS (all args) and $1, $2, … (positional) in a skill body. */
export function interpolateArgs(body: string, args: string): string {
  const parts = args.length ? args.split(/\s+/) : []
  let out = body.replace(/\$ARGUMENTS/g, args)
  out = out.replace(/\$(\d+)/g, (_, n) => parts[Number(n) - 1] ?? '')
  return out
}
