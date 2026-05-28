import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseSkill } from './parse.js'
import type { SkillMeta } from './types.js'

/** Discover skills from a list of root dirs; earlier roots win on name collision. */
export async function discoverSkills(roots: string[]): Promise<SkillMeta[]> {
  const seen = new Map<string, SkillMeta>()
  for (const root of roots) {
    let entries: string[] = []
    try { entries = await readdir(root) } catch { continue }
    for (const entry of entries) {
      const file = path.join(root, entry, 'SKILL.md')
      try {
        if (!(await stat(file)).isFile()) continue
        const parsed = parseSkill(await readFile(file, 'utf8'))
        if (!seen.has(parsed.name)) {
          seen.set(parsed.name, { name: parsed.name, description: parsed.description, path: file })
        }
      } catch { /* skip missing or malformed skills */ }
    }
  }
  return [...seen.values()]
}

export function defaultSkillRoots(home: string, cwd: string): string[] {
  return [
    path.join(cwd, '.maestro', 'skills'),
    path.join(home, '.maestro', 'skills'),
    path.join(home, '.claude', 'skills'), // Claude Code compatibility
  ]
}
