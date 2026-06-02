import { describe, it, expect } from 'vitest'
import { detectPreference } from '../src/soul-learn.js'

describe('detectPreference', () => {
  it('catches durable directives and distills them', () => {
    expect(detectPreference('from now on, always keep answers short')).toMatch(/keep answers short/i)
    expect(detectPreference('please stop apologizing')).toMatch(/stop apologi/i)
    expect(detectPreference('I prefer you use British spelling')).toMatch(/british spelling/i)
    expect(detectPreference('be more concise')).toMatch(/concise/i)
    expect(detectPreference('update your soul to be funnier')).toMatch(/funnier/i)
  })

  it('strips lead-ins and capitalises', () => {
    const line = detectPreference('from now on always explain your reasoning')
    expect(line).not.toMatch(/^from now on/i)
    expect(line && line[0]).toBe(line?.[0]?.toUpperCase())
  })

  it('ignores ordinary task messages', () => {
    expect(detectPreference('add a button to the form')).toBeNull()
    expect(detectPreference('the test always fails on line 12')).toBeNull()
    expect(detectPreference('it never returns the right value, fix it')).toBeNull()
    expect(detectPreference('/soul reset')).toBeNull()
  })

  it('returns null for very long prompts (likely tasks, not preferences)', () => {
    expect(detectPreference('always '.repeat(80))).toBeNull()
  })
})
