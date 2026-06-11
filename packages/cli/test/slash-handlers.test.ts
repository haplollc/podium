import { describe, it, expect, vi } from 'vitest'
import { runSlash, type SlashCtx } from '../src/slash-handlers.js'

function ctx(over: Partial<SlashCtx> = {}): SlashCtx {
  return {
    stats: () => ({ used: 1230, effective: 6000, window: 8192, percentUsed: 0.205 }),
    clear: vi.fn(),
    compact: vi.fn(async () => "Compacted: 5k → 1k tokens."),
    openModelPicker: vi.fn(),
    openSetup: vi.fn(),
    listModels: vi.fn(async () => ['qwen2.5-coder:7b']),
    pull: vi.fn(async () => {}),
    listSkills: () => ['commit'],
    hasSkill: (n) => n === 'commit',
    runSkill: vi.fn(async (n, a) => `running ${n} ${a}`),
    togglePlan: vi.fn(() => true),
    soul: () => 'be kind and concise',
    updateSoul: vi.fn(async () => {}),
    resetSoul: vi.fn(async () => {}),
    tasksReport: vi.fn(() => 'No background tasks.'),
    killTask: vi.fn(() => 'Stopped all background tasks.'),
    toggleMetrics: vi.fn(() => true),
    toggleYolo: vi.fn(() => true),
    openRewind: vi.fn(() => null),
    resume: vi.fn(async () => 'Resumed session (4 messages).'),
    exit: vi.fn(() => 'Bye!'),
    ...over,
  }
}

describe('runSlash', () => {
  it('help lists commands', async () => {
    expect(await runSlash({ name: 'help', args: '' }, ctx())).toContain('/model')
  })
  it('clear calls ctx.clear', async () => {
    const clear = vi.fn()
    expect(await runSlash({ name: 'clear', args: '' }, ctx({ clear }))).toContain('cleared')
    expect(clear).toHaveBeenCalled()
  })
  it('context reports the percent and token counts', async () => {
    const out = await runSlash({ name: 'context', args: '' }, ctx())
    expect(out).toContain('21%')
    expect(out).toContain('1230/6000')
  })
  it('compact awaits ctx.compact', async () => {
    const compact = vi.fn(async () => {})
    await runSlash({ name: 'compact', args: '' }, ctx({ compact }))
    expect(compact).toHaveBeenCalled()
  })
  it('setup reopens the wizard', async () => {
    const openSetup = vi.fn()
    expect(await runSlash({ name: 'setup', args: '' }, ctx({ openSetup }))).toContain('setup')
    expect(openSetup).toHaveBeenCalled()
  })
  it('model opens the picker', async () => {
    const openModelPicker = vi.fn()
    await runSlash({ name: 'model', args: '' }, ctx({ openModelPicker }))
    expect(openModelPicker).toHaveBeenCalled()
  })
  it('models lists installed models', async () => {
    expect(await runSlash({ name: 'models', args: '' }, ctx())).toContain('qwen2.5-coder:7b')
  })
  it('pull requires an argument', async () => {
    expect(await runSlash({ name: 'pull', args: '' }, ctx())).toContain('Usage')
  })
  it('pull invokes ctx.pull with the model name', async () => {
    const pull = vi.fn(async () => {})
    await runSlash({ name: 'pull', args: 'gpt-oss:20b' }, ctx({ pull }))
    expect(pull).toHaveBeenCalledWith('gpt-oss:20b')
  })
  it('skills lists discovered skills', async () => {
    expect(await runSlash({ name: 'skills', args: '' }, ctx())).toContain('commit')
  })
  it('plan toggles plan mode', async () => {
    const togglePlan = vi.fn(() => true)
    expect(await runSlash({ name: 'plan', args: '' }, ctx({ togglePlan }))).toContain('ON')
    expect(togglePlan).toHaveBeenCalled()
  })
  it('dispatches /<skill-name> to runSkill', async () => {
    const runSkill = vi.fn(async () => 'commit body')
    const out = await runSlash({ name: 'commit', args: '-m hi' }, ctx({ runSkill }))
    expect(runSkill).toHaveBeenCalledWith('commit', '-m hi')
    expect(out).toBe('commit body')
  })
  it('soul shows the active personality', async () => {
    expect(await runSlash({ name: 'soul', args: '' }, ctx())).toContain('be kind and concise')
  })
  it('soul <text> appends a preference', async () => {
    const updateSoul = vi.fn(async () => {})
    const out = await runSlash({ name: 'soul', args: 'be more concise' }, ctx({ updateSoul }))
    expect(updateSoul).toHaveBeenCalledWith('be more concise')
    expect(out).toContain('be more concise')
  })
  it('soul reset clears learned preferences', async () => {
    const resetSoul = vi.fn(async () => {})
    const out = await runSlash({ name: 'soul', args: 'reset' }, ctx({ resetSoul }))
    expect(resetSoul).toHaveBeenCalled()
    expect(out).toContain('reset')
  })
  it('metrics toggles the dashboard', async () => {
    const toggleMetrics = vi.fn(() => true)
    expect(await runSlash({ name: 'metrics', args: '' }, ctx({ toggleMetrics }))).toContain('ON')
    expect(toggleMetrics).toHaveBeenCalled()
  })
  it('yolo toggles permission-skipping', async () => {
    const toggleYolo = vi.fn(() => true)
    expect(await runSlash({ name: 'yolo', args: '' }, ctx({ toggleYolo }))).toContain('YOLO ON')
    expect(toggleYolo).toHaveBeenCalled()
  })
  it('rewind opens the picker when possible', async () => {
    const openRewind = vi.fn(() => null)
    expect(await runSlash({ name: 'rewind', args: '' }, ctx({ openRewind }))).toContain('Opening rewind')
    expect(openRewind).toHaveBeenCalled()
  })
  it('rewind surfaces the reason it can\'t open', async () => {
    const openRewind = vi.fn(() => 'Nothing to rewind to yet')
    expect(await runSlash({ name: 'rewind', args: '' }, ctx({ openRewind }))).toContain('Nothing to rewind to')
  })
  it('tasks reports background tasks', async () => {
    const tasksReport = vi.fn(() => '#1 [running] python3 -m http.server — http://localhost:8000 (3s)')
    const out = await runSlash({ name: 'tasks', args: '' }, ctx({ tasksReport }))
    expect(tasksReport).toHaveBeenCalled()
    expect(out).toContain('http://localhost:8000')
  })
  it('tasks kill <id> routes to killTask', async () => {
    const killTask = vi.fn(() => 'Stopped task #1.')
    const out = await runSlash({ name: 'tasks', args: 'kill 1' }, ctx({ killTask }))
    expect(killTask).toHaveBeenCalledWith('1')
    expect(out).toContain('Stopped task #1')
  })
  it('unknown command (not a skill) is reported', async () => {
    expect(await runSlash({ name: 'wat', args: '' }, ctx())).toContain('Unknown command')
  })
  it('resume restores the saved session', async () => {
    const resume = vi.fn(async () => 'Resumed session (4 messages).')
    expect(await runSlash({ name: 'resume', args: '' }, ctx({ resume }))).toContain('Resumed')
    expect(resume).toHaveBeenCalled()
  })
  it('exit and quit both route to ctx.exit', async () => {
    const exit = vi.fn(() => 'Bye!')
    expect(await runSlash({ name: 'exit', args: '' }, ctx({ exit }))).toBe('Bye!')
    expect(await runSlash({ name: 'quit', args: '' }, ctx({ exit }))).toBe('Bye!')
    expect(exit).toHaveBeenCalledTimes(2)
  })
})
