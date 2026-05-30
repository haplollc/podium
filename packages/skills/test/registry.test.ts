import { describe, it, expect } from 'vitest'
import { interpolateArgs, parseSkill } from '../src/parse.js'
import { SkillRegistry, buildSkillListing, mergeSkills } from '../src/registry.js'
import { builtinSkills } from '../src/builtins.js'

describe('interpolateArgs', () => {
  it('substitutes $ARGUMENTS and positional $1/$2', () => {
    expect(interpolateArgs('all=[$ARGUMENTS] first=$1 second=$2', 'apple banana')).toBe('all=[apple banana] first=apple second=banana')
  })
  it('leaves missing positionals empty', () => {
    expect(interpolateArgs('x=$1 y=$2', 'only')).toBe('x=only y=')
  })
  it('handles no args', () => {
    expect(interpolateArgs('nothing to fill', '')).toBe('nothing to fill')
  })
})

describe('parseSkill', () => {
  it('parses frontmatter + body', () => {
    const s = parseSkill('---\nname: commit\ndescription: Make a commit\n---\nDo the thing.')
    expect(s.name).toBe('commit')
    expect(s.description).toBe('Make a commit')
    expect(s.body).toBe('Do the thing.')
  })
  it('throws on missing frontmatter', () => {
    expect(() => parseSkill('no frontmatter here')).toThrow()
  })
})

describe('builtin skills', () => {
  it('ships commit/review/explain/test with non-empty bodies', () => {
    const names = builtinSkills.map(s => s.name).sort()
    expect(names).toEqual(['commit', 'explain', 'review', 'test'])
    for (const s of builtinSkills) expect((s.body ?? '').length).toBeGreaterThan(20)
  })
})

describe('mergeSkills', () => {
  it('lets a user skill override a builtin of the same name', () => {
    const merged = mergeSkills([{ name: 'commit', description: 'mine', path: '/x' }], builtinSkills)
    const commit = merged.filter(s => s.name === 'commit')
    expect(commit).toHaveLength(1)
    expect(commit[0].description).toBe('mine')
  })
  it('keeps builtins that are not overridden', () => {
    const merged = mergeSkills([{ name: 'commit', description: 'mine', path: '/x' }], builtinSkills)
    expect(merged.find(s => s.name === 'review')).toBeTruthy()
  })
})

describe('SkillRegistry + listing', () => {
  it('serves inline builtin bodies and reports has()', async () => {
    const reg = new SkillRegistry(builtinSkills)
    expect(reg.has('commit')).toBe(true)
    expect(reg.has('nope')).toBe(false)
    expect(await reg.getBody('commit')).toContain('commit')
    expect(await reg.getBody('nope')).toBeNull()
  })
  it('listing names every skill and instructs restraint', () => {
    const listing = buildSkillListing(builtinSkills)
    for (const s of builtinSkills) expect(listing).toContain(s.name)
    expect(listing.toLowerCase()).toContain('only use')
  })
  it('empty listing is empty string', () => {
    expect(buildSkillListing([])).toBe('')
  })
})
