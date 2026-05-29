import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@podium/hardware': pkg('hardware'),
      '@podium/providers': pkg('providers'),
      '@podium/core': pkg('core'),
      '@podium/tools': pkg('tools'),
      '@podium/tui': pkg('tui'),
      '@podium/skills': pkg('skills'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
  },
})
