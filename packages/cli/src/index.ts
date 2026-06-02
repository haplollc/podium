import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import { resolveCommand, HELP_TEXT } from './cli-args.js'
import { runUpdate } from './update.js'
import { registerShutdown, shutdown } from './session.js'
import pkg from '../package.json' with { type: 'json' }

const VERSION = (pkg as { version: string }).version

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  switch (resolveCommand(argv)) {
    case 'version':
      console.log(VERSION)
      return
    case 'help':
      console.log(HELP_TEXT)
      return
    case 'update':
      await runUpdate()
      return
    case 'run': {
      registerShutdown()  // SIGTERM / terminal-close (SIGHUP) free the GPU
      const { waitUntilExit } = render(React.createElement(App))
      await waitUntilExit()  // resolves on Ctrl+C / quit
      await shutdown(0)      // unload the model on the way out
      return
    }
  }
}
