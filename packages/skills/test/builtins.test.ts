import { describe, it, expect } from 'vitest'
import { builtinSkills } from '../src/builtins.js'
import { SkillRegistry, mergeSkills } from '../src/registry.js'
import type { SkillMeta } from '../src/types.js'

describe('built-in skills', () => {
  it('ships commit/review/explain/test with inline bodies', () => {
    const names = builtinSkills.map(s => s.name).sort()
    expect(names).toEqual(['commit', 'explain', 'review', 'test'])
    for (const s of builtinSkills) expect(s.body && s.body.length).toBeTruthy()
  })

  it('registry serves a built-in body without a file', async () => {
    const reg = new SkillRegistry(builtinSkills)
    expect(reg.has('commit')).toBe(true)
    expect(await reg.getBody('commit')).toContain('git commit')
  })

  it('interpolates args into a built-in (explain $ARGUMENTS)', async () => {
    const reg = new SkillRegistry(builtinSkills)
    expect(await reg.getBody('explain', 'src/app.tsx')).toContain('src/app.tsx')
  })

  it('a discovered file skill overrides a built-in of the same name', () => {
    const discovered: SkillMeta[] = [{ name: 'commit', description: 'my commit', path: '/x/SKILL.md' }]
    const merged = mergeSkills(discovered, builtinSkills)
    const commit = merged.find(m => m.name === 'commit')!
    expect(commit.description).toBe('my commit')   // file wins
    expect(commit.path).toBe('/x/SKILL.md')
    expect(merged.filter(m => m.name === 'commit')).toHaveLength(1)
  })
})
