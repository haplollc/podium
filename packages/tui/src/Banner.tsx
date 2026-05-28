import React from 'react'
import { Box, Text } from 'ink'

/** Shorten a path to ~/… for display. */
function tilde(p: string): string {
  const home = process.env.HOME
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p
}

export function Banner({ model, cwd }: { model: string; cwd: string }): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="magenta" bold>✦ Maestro</Text>
        <Text dimColor>  ·  local-model coding agent</Text>
      </Text>
      <Text dimColor>{model}  ·  {tilde(cwd)}</Text>
      <Text dimColor>type <Text color="cyan">/</Text> for commands · <Text color="cyan">/help</Text> for the list</Text>
    </Box>
  )
}
