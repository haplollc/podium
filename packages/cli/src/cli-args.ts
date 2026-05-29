export type CliCommand = 'version' | 'help' | 'update' | 'run'

/** Resolve the top-level command from argv (everything after `node podium`). */
export function resolveCommand(argv: string[]): CliCommand {
  const first = argv[0]
  if (first === '--version' || first === '-v') return 'version'
  if (first === '--help' || first === '-h') return 'help'
  if (first === 'update') return 'update'
  return 'run'
}

export const HELP_TEXT = `podium — local-model terminal coding agent

Usage:
  podium              Start the interactive agent (setup wizard on first run)
  podium update       Update to the latest version (Homebrew or npm)
  podium --version    Print the version
  podium --help       Show this help

In-session slash commands:
  /model /models /pull <name> /skills /plan /context /compact /clear /help`
