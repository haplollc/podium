import { describe, it, expect } from 'vitest'
import { detectInstall, updateCommand } from '../src/update.js'
import { resolveCommand } from '../src/cli-args.js'

describe('detectInstall', () => {
  it('detects a Homebrew install', () => {
    expect(detectInstall('/opt/homebrew/bin/maestro')).toBe('brew')
    expect(detectInstall('/usr/local/Cellar/maestro/0.1.0/bin/maestro')).toBe('brew')
  })
  it('detects an npm global install', () => {
    expect(detectInstall('/usr/lib/node_modules/maestro-cli/bin/maestro.js')).toBe('npm')
  })
  it('falls back to unknown', () => {
    expect(detectInstall('/Users/me/dev/maestro/packages/cli/bin/maestro.js')).toBe('unknown')
  })
})

describe('updateCommand', () => {
  it('uses brew upgrade for brew installs', () => {
    expect(updateCommand('brew')).toContain('brew upgrade')
  })
  it('uses npm install -g for npm/unknown installs', () => {
    expect(updateCommand('npm')).toContain('npm install -g')
    expect(updateCommand('unknown')).toContain('npm install -g')
  })
})

describe('resolveCommand', () => {
  it('maps flags and subcommands', () => {
    expect(resolveCommand(['--version'])).toBe('version')
    expect(resolveCommand(['-v'])).toBe('version')
    expect(resolveCommand(['--help'])).toBe('help')
    expect(resolveCommand(['update'])).toBe('update')
    expect(resolveCommand([])).toBe('run')
    expect(resolveCommand(['somefile'])).toBe('run')
  })
})
