import { describe, it, expect, vi, beforeEach } from 'vitest'
import { webSearchTool, webFetchTool, parseDuckDuckGo, htmlToText, isOffline, OFFLINE_MSG } from '../src/web.js'

const DDG_HTML = `
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=x">First &amp; Best</a>
  <a class="result__snippet">A great first result.</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fb">Second Result</a>
  <a class="result__snippet">Another snippet.</a>
</div>`

function netError(): Error {
  const e = new TypeError('fetch failed')
  ;(e as unknown as { cause: { code: string } }).cause = { code: 'ENOTFOUND' }
  return e
}

describe('parseDuckDuckGo', () => {
  it('extracts title, decoded URL, and snippet', () => {
    const r = parseDuckDuckGo(DDG_HTML)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ title: 'First & Best', url: 'https://example.com/a', snippet: 'A great first result.' })
    expect(r[1].url).toBe('https://example.org/b')
  })
})

describe('htmlToText', () => {
  it('strips scripts/tags and decodes entities', () => {
    const out = htmlToText('<style>x{}</style><script>evil()</script><h1>Title</h1><p>Hello &amp; bye</p>')
    expect(out).not.toContain('evil')
    expect(out).not.toContain('<')
    expect(out).toContain('Title')
    expect(out).toContain('Hello & bye')
  })
})

describe('isOffline', () => {
  it('detects network errors', () => {
    expect(isOffline(netError())).toBe(true)
    expect(isOffline(new Error('HTTP 404'))).toBe(false)
  })
})

describe('WebSearch tool', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('returns ranked results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(DDG_HTML, { status: 200 })))
    const out = await webSearchTool.run({ query: 'example' }, { cwd: '/x' })
    expect(out).toContain('1. First & Best')
    expect(out).toContain('https://example.com/a')
  })
  it('reports offline gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw netError() }))
    expect(await webSearchTool.run({ query: 'x' }, { cwd: '/x' })).toBe(OFFLINE_MSG)
  })
})

describe('WebFetch tool', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('returns readable text from HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><body><h1>Docs</h1><p>Install it.</p></body></html>', {
        status: 200, headers: { 'content-type': 'text/html' },
      })))
    const out = await webFetchTool.run({ url: 'example.com/docs' }, { cwd: '/x' })
    expect(out).toContain('Docs')
    expect(out).toContain('Install it.')
  })
  it('reports offline gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw netError() }))
    expect(await webFetchTool.run({ url: 'https://example.com' }, { cwd: '/x' })).toBe(OFFLINE_MSG)
  })
})
