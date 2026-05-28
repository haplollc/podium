import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

export function main(): void {
  render(React.createElement(App))
}
