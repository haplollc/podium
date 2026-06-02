import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { RewindPicker, type RewindEntry } from '../src/RewindPicker.js'

const entries: RewindEntry[] = [
  { id: '2', label: 'add a chart', fileCount: 2 },
  { id: '1', label: 'write hello world', fileCount: 1 },
]

describe('RewindPicker', () => {
  it('lists checkpoints with file counts and key hints', () => {
    const { lastFrame } = render(<RewindPicker entries={entries} onPick={() => {}} onCancel={() => {}} />)
    const f = lastFrame() ?? ''
    expect(f).toContain('add a chart')
    expect(f).toContain('write hello world')
    expect(f).toContain('2 files')
    expect(f).toContain('1 file')
    expect(f).toContain('Enter restore')
  })

  it('Enter picks the top (newest) entry by default', async () => {
    const onPick = vi.fn()
    const { stdin } = render(<RewindPicker entries={entries} onPick={onPick} onCancel={() => {}} />)
    await new Promise(r => setTimeout(r, 30))
    stdin.write('\r')
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('2'))
  })

  it('down arrow then Enter picks the next entry', async () => {
    const onPick = vi.fn()
    const { stdin } = render(<RewindPicker entries={entries} onPick={onPick} onCancel={() => {}} />)
    await new Promise(r => setTimeout(r, 40))
    stdin.write('[B')   // down arrow
    await new Promise(r => setTimeout(r, 60))
    stdin.write('\r')
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('1'))
  })

  it('Esc cancels', async () => {
    const onCancel = vi.fn()
    const { stdin } = render(<RewindPicker entries={entries} onPick={() => {}} onCancel={onCancel} />)
    await new Promise(r => setTimeout(r, 40))
    stdin.write('')   // escape
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalled())
  })

  it('shows an empty-state message when there are no checkpoints', () => {
    const { lastFrame } = render(<RewindPicker entries={[]} onPick={() => {}} onCancel={() => {}} />)
    expect(lastFrame() ?? '').toContain('Nothing to rewind to')
  })
})
