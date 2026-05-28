import { describe, it, expect, vi } from 'vitest'
import { runSlash, type SlashCtx } from '../src/slash-handlers.js'

function ctx(over: Partial<SlashCtx> = {}): SlashCtx {
  return {
    stats: () => ({ used: 1230, effective: 6000, window: 8192, percentUsed: 0.205 }),
    clear: vi.fn(),
    compact: vi.fn(async () => {}),
    openModelPicker: vi.fn(),
    listModels: vi.fn(async () => ['qwen2.5-coder:7b']),
    pull: vi.fn(async () => {}),
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
  it('unknown command is reported', async () => {
    expect(await runSlash({ name: 'wat', args: '' }, ctx())).toContain('Unknown command')
  })
})
