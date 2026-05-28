import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@maestro/hardware': pkg('hardware'),
      '@maestro/providers': pkg('providers'),
      '@maestro/core': pkg('core'),
      '@maestro/tools': pkg('tools'),
      '@maestro/tui': pkg('tui'),
      '@maestro/skills': pkg('skills'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
  },
})
