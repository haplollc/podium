import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, Static, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { ContextStats } from '@podium/core'
import type { TodoItem } from '@podium/tools'
import { ContextMeter } from './ContextMeter.js'
import { MetricsBar, type MetricsData } from './MetricsBar.js'
import { Markdown } from './Markdown.js'
import { Banner } from './Banner.js'

export interface TranscriptEntry { role: 'user' | 'assistant' | 'tool' | 'output' | 'note' | 'banner'; text: string }

/**
 * Only hide the live preview when the buffer is *clearly* a raw text tool-call
 * (starts with { or [ and carries tool-call keys). Plain prose — even prose
 * containing a code fence or a stray brace — must keep streaming so narration
 * doesn't appear then vanish.
 */
function looksLikeRawToolCall(s: string): boolean {
  const t = s.trimStart()
  if (!t.startsWith('{') && !t.startsWith('[')) return false
  return /"(name|tool|tool_name|function|arguments|tool_calls)"\s*:/.test(t)
}

export function Repl(props: {
  stats: ContextStats
  transcript: TranscriptEntry[]
  onSubmit: (input: string) => void | Promise<unknown>
  busy: boolean
  streaming?: string            // live assistant text being typed out
  status?: string               // spinner label while busy (e.g. "Loading model…")
  commands?: string[]           // command names for /autocomplete
  metrics?: MetricsData         // live dashboard over the input (toggle with /metrics)
  onAbort?: () => void          // Esc while busy stops the running turn
  todos?: TodoItem[]            // live task checklist shown above the input
  model?: string                // for the banner (printed once, at top)
  cwd?: string
  history?: string[]            // past prompts, oldest→newest (up/down to recall)
  queued?: string[]             // messages queued while busy (shown above input)
  onQueue?: (text: string) => void  // called when Enter is pressed during a running turn
}): React.ReactElement {
  const [input, setInput] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef('')
  const selRef = useRef(0)
  const lastEscRef = useRef(0)
  const histIdxRef = useRef(-1)  // -1 = live draft; else index into history
  const [elapsed, setElapsed] = useState(0)
  const busyStartRef = useRef(0)

  useEffect(() => {
    if (!props.busy) return
    busyStartRef.current = Date.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - busyStartRef.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [props.busy])

  const commands = props.commands ?? []

  function matchesFor(value: string): string[] {
    const m = /^\/([^\s]*)$/.exec(value)
    if (!m) return []
    const q = m[1].toLowerCase()
    return commands.filter(c => c.toLowerCase().startsWith(q)).slice(0, 6)
  }

  function setBoth(v: string) { inputRef.current = v; setInput(v) }
  function setSelBoth(n: number) { selRef.current = n; setSel(n) }

  function submit(value: string) {
    setBoth(''); setSelBoth(0); histIdxRef.current = -1
    if (value.length === 0) return
    // While a turn is running, queue instead of dropping; otherwise run now.
    if (props.busy) props.onQueue?.(value)
    else void props.onSubmit(value)
  }

  useInput((chunk, key) => {
    // Esc: stop a running turn, or double-tap to clear input.
    if (key.escape) {
      if (props.busy) { props.onAbort?.(); return }
      const now = Date.now()
      if (inputRef.current.length > 0 && now - lastEscRef.current < 600) { setBoth(''); setSelBoth(0) }
      lastEscRef.current = now
      return
    }
    const cur = inputRef.current
    const menu = matchesFor(cur)
    const menuOpen = menu.length > 0
    const history = props.history ?? []

    if (key.upArrow) {
      if (menuOpen) { setSelBoth(Math.max(0, selRef.current - 1)); return }
      if (history.length === 0) return
      histIdxRef.current = histIdxRef.current === -1 ? history.length - 1 : Math.max(0, histIdxRef.current - 1)
      setBoth(history[histIdxRef.current]); setSelBoth(0)
      return
    }
    if (key.downArrow) {
      if (menuOpen) { setSelBoth(Math.min(menu.length - 1, selRef.current + 1)); return }
      if (histIdxRef.current === -1) return
      if (histIdxRef.current >= history.length - 1) { histIdxRef.current = -1; setBoth('') }
      else { histIdxRef.current += 1; setBoth(history[histIdxRef.current]) }
      setSelBoth(0)
      return
    }
    if (key.backspace || key.delete) { setBoth(cur.slice(0, -1)); setSelBoth(0); histIdxRef.current = -1; return }
    if (key.tab) {
      if (menuOpen) setBoth('/' + menu[Math.min(selRef.current, menu.length - 1)] + ' ')
      setSelBoth(0)
      return
    }
    if (key.ctrl || key.meta) return

    const parts = chunk.split(/[\r\n]/)
    if (key.return || parts.length > 1) {
      if (menuOpen && !props.busy) { submit('/' + menu[Math.min(selRef.current, menu.length - 1)]); return }
      submit(cur + (parts[0] ?? ''))
      return
    }
    setBoth(cur + chunk); setSelBoth(0); histIdxRef.current = -1
  })

  const menu = matchesFor(input)

  return (
    <Box flexDirection="column">
      <Static items={[{ role: 'banner' as const, text: '' }, ...props.transcript]}>
        {(e, i) => {
          if (e.role === 'banner') return <Box key="banner"><Banner model={props.model ?? ''} cwd={props.cwd ?? ''} /></Box>
          if (e.role === 'output') {
            const lines = e.text.split('\n')
            return (
              <Box key={i} flexDirection="column" marginLeft={2}>
                {lines.map((line, j) => {
                  const prefix = j === 0 ? '  ⎿  ' : '     '
                  if (/^\+ /.test(line)) return <Text key={j} color="green">{prefix}{line}</Text>
                  if (/^- /.test(line)) return <Text key={j} color="red">{prefix}{line}</Text>
                  return <Text key={j} dimColor>{prefix}{line}</Text>
                })}
              </Box>
            )
          }
          if (e.role === 'tool') return <Text key={i}><Text color="green">⏺</Text> {e.text}</Text>
          if (e.role === 'note') return <Text key={i} color="yellow">· {e.text}</Text>
          if (e.role === 'assistant') return <Box key={i} marginTop={1}><Markdown content={e.text} /></Box>
          return <Text key={i} color="cyan">› {e.text}</Text>
        }}
      </Static>

      {props.busy && props.streaming && !looksLikeRawToolCall(props.streaming)
        ? <Box marginTop={1}><Markdown content={props.streaming} /></Box>
        : null}

      {props.busy && (
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text color="yellow"> {props.status ?? 'Thinking…'}</Text>
          <Text dimColor> ({elapsed}s)</Text>
        </Box>
      )}

      {props.todos && props.todos.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text dimColor>Tasks</Text>
          {props.todos.map((t, i) => {
            const mark = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○'
            const color = t.status === 'completed' ? 'green' : t.status === 'in_progress' ? 'cyan' : undefined
            return (
              <Text key={i} color={color} bold={t.status === 'in_progress'} strikethrough={t.status === 'completed'}>
                {' '}{mark} {t.content}
              </Text>
            )
          })}
        </Box>
      )}

      {props.queued && props.queued.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text dimColor>queued ({props.queued.length}) — sent together when the current turn finishes</Text>
          {props.queued.map((q, i) => (
            <Text key={i} backgroundColor="blackBright" color="white"> ↳ {q.length > 74 ? q.slice(0, 73) + '…' : q} </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        {props.metrics ? <MetricsBar m={props.metrics} /> : <ContextMeter stats={props.stats} />}
      </Box>

      <Box
        borderStyle="single"
        borderColor={props.busy ? 'gray' : 'cyan'}
        borderLeft={false}
        borderRight={false}
        paddingY={0}
      >
        <Text color="cyan">› </Text>
        {input.length === 0
          ? <Text dimColor>{props.busy ? 'type to queue a message · Esc to stop' : 'send a message  ·  / for commands · ↑ history'}</Text>
          : <Text>{input}<Text color="cyan">▍</Text></Text>}
      </Box>

      {!props.busy && menu.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {menu.map((c, i) => (
            <Text key={c} color={i === sel ? 'black' : 'cyan'} backgroundColor={i === sel ? 'cyan' : undefined}>
              {' '}/{c}{' '}
            </Text>
          ))}
          <Text dimColor>↑/↓ select · Tab complete · Enter run</Text>
        </Box>
      )}
    </Box>
  )
}
