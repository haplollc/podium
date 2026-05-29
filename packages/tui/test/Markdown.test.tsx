import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Markdown } from '../src/Markdown.js'

describe('Markdown', () => {
  it('renders bold, inline code, and bullets as plain text content', () => {
    const { lastFrame } = render(<Markdown content={'Here is **bold** and `code`.\n- item one\n# Heading'} />)
    const f = lastFrame() ?? ''
    expect(f).toContain('bold')
    expect(f).toContain('code')
    expect(f).toContain('• item one')
    expect(f).toContain('Heading')
    // markers are consumed, not shown literally
    expect(f).not.toContain('**bold**')
    expect(f).not.toContain('`code`')
  })
})
