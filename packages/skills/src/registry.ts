import { readFile } from 'node:fs/promises'
import { parseSkill, interpolateArgs } from './parse.js'
import type { SkillMeta } from './types.js'

export class SkillRegistry {
  constructor(private metas: SkillMeta[]) {}

  list(): SkillMeta[] { return this.metas }

  has(name: string): boolean { return this.metas.some(m => m.name === name) }

  /** Load the full body of a skill on demand (progressive disclosure), args-interpolated. */
  async getBody(name: string, args = ''): Promise<string | null> {
    const meta = this.metas.find(m => m.name === name)
    if (!meta) return null
    // Inline (built-in) skills carry their body; file-backed ones are read on demand.
    const body = meta.body !== undefined ? meta.body : parseSkill(await readFile(meta.path!, 'utf8')).body
    return interpolateArgs(body, args)
  }
}

/** Merge discovered (file) skills over built-ins — a user's SKILL.md wins by name. */
export function mergeSkills(discovered: SkillMeta[], builtins: SkillMeta[]): SkillMeta[] {
  const names = new Set(discovered.map(m => m.name))
  return [...discovered, ...builtins.filter(b => !names.has(b.name))]
}

/** Compact name+description listing for the system prompt (progressive disclosure). */
export function buildSkillListing(metas: SkillMeta[]): string {
  if (!metas.length) return ''
  const lines = metas.map(m => `- ${m.name}: ${m.description}`)
  return `Available skills (invoke with the Skill tool or /<name>):\n${lines.join('\n')}`
}
