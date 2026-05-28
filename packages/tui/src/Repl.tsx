import React, { useState, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ContextStats } from '@maestro/core'
import { ContextMeter } from './ContextMeter.js'

export interface TranscriptEntry { role: 'user' | 'assistant' | 'tool'; text: string }

export function Repl(props: {
  stats: ContextStats
  transcript: TranscriptEntry[]
  onSubmit: (input: string) => void | Promise<unknown>
  busy: boolean
}): React.ReactElement {
  const [input, setInput] = useState('')
  const inputRef = useRef('')

  function submit(extra = '') {
    const value = inputRef.current + extra
    inputRef.current = ''
    setInput('')
    if (value.length > 0) void props.onSubmit(value)
  }

  useInput((chunk, key) => {
    if (props.busy) return
    if (key.backspace || key.delete) {
      inputRef.current = inputRef.current.slice(0, -1)
      setInput(inputRef.current)
      return
    }
    if (key.ctrl || key.meta) return
    // Ink may deliver typed text and the Enter key together in one chunk.
    const parts = chunk.split(/[\r\n]/)
    if (key.return || parts.length > 1) {
      submit(parts[0] ?? '')
      return
    }
    inputRef.current += chunk
    setInput(inputRef.current)
  })

  return (
    <Box flexDirection="column">
      {props.transcript.map((e, i) => (
        <Text key={i} color={e.role === 'user' ? 'cyan' : e.role === 'tool' ? 'gray' : undefined}>
          {e.role === 'user' ? '› ' : e.role === 'tool' ? '  ⚙ ' : ''}{e.text}
        </Text>
      ))}
      <Box marginTop={1}><ContextMeter stats={props.stats} /></Box>
      <Box>
        <Text color="cyan">› </Text>
        <Text>{input}</Text>
        <Text>{props.busy ? ' …thinking' : ''}</Text>
      </Box>
    </Box>
  )
}
