import { describe, it, expect } from 'vitest'
import { parseSkill, interpolateArgs } from '../src/parse.js'

describe('parseSkill', () => {
  it('parses frontmatter and body', () => {
    const doc = '---\nname: commit\ndescription: Make a git commit\nallowed-tools:\n  - Bash\n  - Read\n---\nDo the commit.'
    const s = parseSkill(doc)
    expect(s.name).toBe('commit')
    expect(s.description).toBe('Make a git commit')
    expect(s.allowedTools).toEqual(['Bash', 'Read'])
    expect(s.userInvocable).toBe(true)
    expect(s.body).toBe('Do the commit.')
  })

  it('respects user-invocable: false and when_to_use', () => {
    const doc = '---\nname: x\ndescription: y\nuser-invocable: false\nwhen_to_use: when needed\n---\nbody'
    const s = parseSkill(doc)
    expect(s.userInvocable).toBe(false)
    expect(s.whenToUse).toBe('when needed')
  })

  it('throws without frontmatter or required fields', () => {
    expect(() => parseSkill('no frontmatter here')).toThrow(/frontmatter/)
    expect(() => parseSkill('---\nname: only\n---\nbody')).toThrow(/name and description/)
  })
})

describe('interpolateArgs', () => {
  it('replaces $ARGUMENTS and positional $1/$2', () => {
    expect(interpolateArgs('all=$ARGUMENTS first=$1 second=$2', 'a b')).toBe('all=a b first=a second=b')
  })
  it('replaces missing positionals with empty string', () => {
    expect(interpolateArgs('x=$1 y=$2', 'only')).toBe('x=only y=')
  })
})
