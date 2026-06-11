import React from 'react'
import { Box, Text } from 'ink'

/** Render inline markdown: **bold**, *italic* / _italic_, `code`. */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyBase}-${i++}`
    if (tok.startsWith('**')) nodes.push(<Text key={key} bold>{tok.slice(2, -2)}</Text>)
    else if (tok.startsWith('`')) nodes.push(<Text key={key} color="cyan">{tok.slice(1, -1)}</Text>)
    else nodes.push(<Text key={key} italic>{tok.slice(1, -1)}</Text>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Lightweight markdown for model responses: headings, bullets, code fences, and inline styles. */
export function Markdown({ content }: { content: string }): React.ReactElement {
  const lines = content.split('\n')
  let inFence = false
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const fence = /^\s*```(\w*)/.exec(line)
        if (fence) {
          inFence = !inFence
          // Show the opener as a dim language tag, hide the bare closer.
          return <Text key={i} dimColor>{inFence && fence[1] ? `┌ ${fence[1]}` : inFence ? '┌' : '└'}</Text>
        }
        if (inFence) return <Text key={i} color="cyan">{'│ '}{line}</Text>
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) return <Text key={i} bold color="magenta">{renderInline(heading[2], `h${i}`)}</Text>
        const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
        if (bullet) return <Text key={i}>{bullet[1]}  • {renderInline(bullet[2], `b${i}`)}</Text>
        return <Text key={i}>{renderInline(line, `l${i}`)}</Text>
      })}
    </Box>
  )
}
