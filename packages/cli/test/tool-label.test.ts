import { describe, it, expect } from 'vitest'
import { toolLabel, toolActivity, toolStartNote, toolResultNote } from '../src/tool-label.js'

const call = (name: string, args: Record<string, unknown>) => ({ id: '1', name, arguments: args })

describe('toolLabel', () => {
  it('shows Bash command, not JSON', () => {
    expect(toolLabel(call('Bash', { command: 'python3 chart.py' }))).toBe('Bash › python3 chart.py')
  })
  it('shows only the basename for file tools (not the content)', () => {
    expect(toolLabel(call('Write', { file_path: '/Users/x/chart.py', content: 'huge\nblob\nof\ncode' })))
      .toBe('Write › chart.py')
    expect(toolLabel(call('Read', { file_path: '/a/b/foo.ts' }))).toBe('Read › foo.ts')
    expect(toolLabel(call('Edit', { file_path: '/a/b/foo.ts' }))).toBe('Edit › foo.ts')
  })
  it('summarizes search/fetch/todo/grep', () => {
    expect(toolLabel(call('WebSearch', { query: 'newest qwen coder' }))).toBe('WebSearch › newest qwen coder')
    expect(toolLabel(call('WebFetch', { url: 'https://ollama.com' }))).toBe('WebFetch › https://ollama.com')
    expect(toolLabel(call('TodoWrite', { todos: [1, 2, 3] }))).toBe('TodoWrite › 3 items')
    expect(toolLabel(call('Grep', { pattern: 'needle', glob: '*.ts' }))).toBe('Grep › needle in *.ts')
  })
  it('never contains raw JSON braces', () => {
    const label = toolLabel(call('Write', { file_path: 'x.py', content: '{"a":1}' }))
    expect(label).not.toContain('{')
  })
})

describe('toolActivity', () => {
  it('describes the current action in present tense', () => {
    expect(toolActivity(call('Bash', { command: 'python3 chart.py' }))).toBe('Running python3 chart.py')
    expect(toolActivity(call('Write', { file_path: '/a/chart.py' }))).toBe('Writing chart.py')
    expect(toolActivity(call('WebSearch', { query: 'qwen3 coder' }))).toContain('Searching the web')
    expect(toolActivity(call('Read', { file_path: '/a/b/foo.ts' }))).toBe('Reading foo.ts')
  })
})

describe('working notes', () => {
  it('creates friendly persistent start notes', () => {
    expect(toolStartNote(call('Glob', { pattern: '**/*.ts' }))).toContain('check the folder structure')
    expect(toolStartNote(call('Write', { path: '/tmp/script.ts' }))).toContain('writing script.ts')
    expect(toolStartNote(call('Bash', { cmd: 'pnpm test' }))).toContain('running pnpm test')
  })

  it('summarizes observable tool results', () => {
    expect(toolResultNote(call('Glob', { pattern: '**/*.ts' }), 'a.ts\nb.ts')).toBe('Okay, I found 2 matching files.')
    expect(toolResultNote(call('Grep', { pattern: 'needle' }), '(no matches)')).toBe('I did not find matches for that search.')
    expect(toolResultNote(call('Bash', { command: 'pnpm test' }), 'exit=0\nok')).toBe('Okay, that command finished successfully.')
    expect(toolResultNote(call('Bash', { command: 'pnpm test' }), 'exit=1\nfail')).toContain('exited with 1')
    expect(toolResultNote(call('Write', { file_path: 'x.ts' }), 'Error: disk full')).toContain('did not complete')
  })
})
