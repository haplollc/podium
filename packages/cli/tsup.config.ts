import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Inline the workspace packages so the published artifact is self-contained.
  noExternal: [/^@podium\//],
  // Runtime deps that stay external (declared in package.json "dependencies").
  external: ['ink', 'react', 'yaml', 'execa'],
  target: 'node20',
  clean: true,
})
