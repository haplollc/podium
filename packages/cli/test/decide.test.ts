import { describe, it, expect } from 'vitest'
import { decideStartScreen } from '../src/app.js'

describe('decideStartScreen', () => {
  it('shows setup when no config', () => {
    expect(decideStartScreen(null, { running: true })).toBe('setup')
  })
  it('shows backend-error when config exists but backend down', () => {
    expect(decideStartScreen({ backend: 'ollama', model: 'm', contextSize: 8192 }, { running: false })).toBe('backend-error')
  })
  it('shows repl when config + backend healthy', () => {
    expect(decideStartScreen({ backend: 'ollama', model: 'm', contextSize: 8192 }, { running: true })).toBe('repl')
  })
})
