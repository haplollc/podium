import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export interface RewindEntry {
  id: string
  label: string        // the user message at that checkpoint
  fileCount: number    // file changes that would be undone by rewinding here
}

/** Claude-Code-style rewind picker: ↑/↓ through recent checkpoints, Enter to restore, Esc to cancel. */
export function RewindPicker(
  { entries, onPick, onCancel }: {
    entries: RewindEntry[]
    onPick: (id: string) => void
    onCancel: () => void
  },
): React.ReactElement {
  const [idx, setIdx] = useState(0)
  useInput((_input, key) => {
    if (key.upArrow) setIdx(i => Math.max(0, i - 1))
    else if (key.downArrow) setIdx(i => Math.min(entries.length - 1, i + 1))
    else if (key.return && entries[idx]) onPick(entries[idx].id)
    else if (key.escape) onCancel()
  })

  if (!entries.length) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow">Nothing to rewind to yet.</Text>
        <Text dimColor>Checkpoints start after each message (and reset on /compact). Esc to close.</Text>
      </Box>
    )
  }

  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
      <Text color="magenta" bold>Rewind to a previous point</Text>
      <Text dimColor>Restores the conversation and undoes file changes made after that point.</Text>
      <Box flexDirection="column" marginTop={1}>
        {entries.map((e, i) => {
          const sel = i === idx
          const trimmed = e.label.replace(/\s+/g, ' ').trim()
          const text = trimmed.length > 60 ? trimmed.slice(0, 59) + '…' : trimmed || '(empty)'
          return (
            <Text key={e.id} color={sel ? 'black' : undefined} backgroundColor={sel ? 'magenta' : undefined}>
              {sel ? ' ❯ ' : '   '}{text}{e.fileCount ? `  · ${e.fileCount} file${e.fileCount === 1 ? '' : 's'}` : ''}{' '}
            </Text>
          )
        })}
      </Box>
      <Text dimColor>↑/↓ choose · Enter restore · Esc cancel</Text>
    </Box>
  )
}
