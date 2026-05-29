import React, { useState, useRef, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import type { ContextStats } from '@podium/core'
import { ContextMeter } from './ContextMeter.js'
import { MetricsBar, type MetricsData } from './MetricsBar.js'
import { Markdown } from './Markdown.js'

export interface TranscriptEntry { role: 'user' | 'assistant' | 'tool' | 'output'; text: string }

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
}): React.ReactElement {
  const [input, setInput] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef('')
  const selRef = useRef(0)
  const lastEscRef = useRef(0)
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
    setBoth(''); setSelBoth(0)
    if (value.length > 0) void props.onSubmit(value)
  }

  useInput((chunk, key) => {
    // Esc is handled in every state: stop a running turn, or double-tap to clear input.
    if (key.escape) {
      if (props.busy) { props.onAbort?.(); return }
      const now = Date.now()
      if (inputRef.current.length > 0 && now - lastEscRef.current < 600) { setBoth(''); setSelBoth(0) }
      lastEscRef.current = now
      return
    }
    if (props.busy) return
    const cur = inputRef.current
    const menu = matchesFor(cur)
    const menuOpen = menu.length > 0

    if (key.upArrow) { if (menuOpen) setSelBoth(Math.max(0, selRef.current - 1)); return }
    if (key.downArrow) { if (menuOpen) setSelBoth(Math.min(menu.length - 1, selRef.current + 1)); return }
    if (key.backspace || key.delete) { setBoth(cur.slice(0, -1)); setSelBoth(0); return }
    if (key.tab) {
      if (menuOpen) setBoth('/' + menu[Math.min(selRef.current, menu.length - 1)] + ' ')
      setSelBoth(0)
      return
    }
    if (key.ctrl || key.meta) return

    const parts = chunk.split(/[\r\n]/)
    if (key.return || parts.length > 1) {
      if (menuOpen) { submit('/' + menu[Math.min(selRef.current, menu.length - 1)]); return }
      submit(cur + (parts[0] ?? ''))
      return
    }
    setBoth(cur + chunk); setSelBoth(0)
  })

  const menu = matchesFor(input)

  return (
    <Box flexDirection="column">
      {props.transcript.map((e, i) => {
        if (e.role === 'output') {
          const lines = e.text.split('\n')
          return (
            <Box key={i} flexDirection="column" marginLeft={2}>
              {lines.map((line, j) => (
                <Text key={j} dimColor>{j === 0 ? '  ⎿  ' : '     '}{line}</Text>
              ))}
            </Box>
          )
        }
        if (e.role === 'tool') {
          return <Text key={i}><Text color="green">⏺</Text> {e.text}</Text>
        }
        if (e.role === 'assistant') {
          return <Box key={i} marginTop={1}><Markdown content={e.text} /></Box>
        }
        return <Text key={i} color="cyan">› {e.text}</Text>
      })}

      {props.busy && props.streaming && !/```|\{\s*"name"\s*:|^\s*[{[]/.test(props.streaming)
        ? <Box marginTop={1}><Markdown content={props.streaming} /></Box>
        : null}

      {props.busy && (
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text color="yellow"> {props.status ?? 'Thinking…'}</Text>
          <Text dimColor> ({elapsed}s)</Text>
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
          ? <Text dimColor>send a message  ·  / for commands</Text>
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
