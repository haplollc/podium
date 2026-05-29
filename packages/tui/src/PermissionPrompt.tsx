import React from 'react'
import { Box, Text, useInput } from 'ink'
import type { ToolCall } from '@podium/providers'

export function PermissionPrompt(
  { call, onDecision }: { call: ToolCall; onDecision: (ok: boolean) => void },
): React.ReactElement {
  useInput((input, key) => {
    const c = input.toLowerCase()
    if (c === 'y') onDecision(true)
    else if (c === 'n' || key.escape) onDecision(false)
  })
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow">Allow {call.name}?</Text>
      <Text dimColor>{JSON.stringify(call.arguments)}</Text>
      <Text>
        <Text color="green">y</Text> allow · <Text color="red">n</Text> deny
      </Text>
    </Box>
  )
}
