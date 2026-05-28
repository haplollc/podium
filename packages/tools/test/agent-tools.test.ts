import { describe, it, expect, vi } from 'vitest'
import { skillTool } from '../src/skill.js'
import { taskTool } from '../src/task.js'
import { exitPlanTool } from '../src/exit-plan.js'
import { baseTools, allTools, agentTools } from '../src/index.js'
import type { ToolContext } from '../src/types.js'

describe('Skill tool', () => {
  it('returns the skill body from the registry', async () => {
    const ctx: ToolContext = {
      cwd: '/x',
      skills: { list: () => [{ name: 'greet', description: 'g' }], getBody: async (n) => n === 'greet' ? 'Say hi.' : null },
    }
    expect(await skillTool.run({ name: 'greet' }, ctx)).toBe('Say hi.')
    expect(await skillTool.run({ name: 'nope' }, ctx)).toContain('unknown skill')
  })
  it('errors when skills are unavailable', async () => {
    expect(await skillTool.run({ name: 'x' }, { cwd: '/x' })).toContain('unavailable')
  })
})

describe('Task tool', () => {
  it('delegates to spawnAgent and returns its report', async () => {
    const spawnAgent = vi.fn(async (p: string) => `report for: ${p}`)
    expect(await taskTool.run({ description: 'd', prompt: 'explore X' }, { cwd: '/x', spawnAgent })).toBe('report for: explore X')
    expect(spawnAgent).toHaveBeenCalledWith('explore X')
  })
})

describe('ExitPlanMode tool', () => {
  it('calls exitPlan with the plan text', async () => {
    const exitPlan = vi.fn(async () => {})
    const out = await exitPlanTool.run({ plan: '1. do thing' }, { cwd: '/x', exitPlan })
    expect(exitPlan).toHaveBeenCalledWith('1. do thing')
    expect(out).toContain('approval')
  })
})

describe('tool registries', () => {
  it('baseTools excludes Task; allTools includes it', () => {
    expect(baseTools.map(t => t.schema.name)).not.toContain('Task')
    expect(allTools.map(t => t.schema.name)).toContain('Task')
    expect(agentTools.map(t => t.schema.name).sort()).toEqual(['ExitPlanMode', 'Skill', 'Task'])
  })
})
