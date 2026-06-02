import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

const OPTIONS: Array<{ label: string; value: boolean; color: string }> = [
  { label: 'Yes, remember it', value: true, color: 'green' },
  { label: 'No thanks', value: false, color: 'red' },
]

/** Confirm before folding a learned preference into SOUL.md. ←/→ choose · Enter · Esc skips. */
export function SoulPrompt(
  { line, onDecision }: { line: string; onDecision: (ok: boolean) => void },
): React.ReactElement {
  const [idx, setIdx] = useState(0)
  useInput((input, key) => {
    if (key.leftArrow || key.upArrow) setIdx(i => (i + OPTIONS.length - 1) % OPTIONS.length)
    else if (key.rightArrow || key.downArrow || key.tab) setIdx(i => (i + 1) % OPTIONS.length)
    else if (key.return) onDecision(OPTIONS[idx].value)
    else if (key.escape) onDecision(false)
    else if (input === 'y' || input === 'Y') onDecision(true)
    else if (input === 'n' || input === 'N') onDecision(false)
  })
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">✎ Add this to my soul?</Text>
      <Text>  "{line}"</Text>
      <Box marginTop={1}>
        {OPTIONS.map((o, i) => (
          <Text key={o.label} color={i === idx ? 'black' : o.color} backgroundColor={i === idx ? o.color : undefined}>
            {i === idx ? ' ❯ ' : '   '}{o.label}{'  '}
          </Text>
        ))}
      </Box>
      <Text dimColor>←/→ to choose · Enter to confirm · Esc to skip · /soul reset to forget later</Text>
    </Box>
  )
}
