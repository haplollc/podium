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
    const parsed = parseSkill(await readFile(meta.path, 'utf8'))
    return interpolateArgs(parsed.body, args)
  }
}

/** Compact name+description listing for the system prompt (progressive disclosure). */
export function buildSkillListing(metas: SkillMeta[]): string {
  if (!metas.length) return ''
  const lines = metas.map(m => `- ${m.name}: ${m.description}`)
  return `Available skills (invoke with the Skill tool or /<name>):\n${lines.join('\n')}`
}
