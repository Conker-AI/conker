import { defineConfig } from 'vitest/config'

// Unit tests for the pure modules in src/lib (no React, no network). Coverage is measured over the
// modules listed here and the floor only moves up: when a number rises, raise it; add a module here
// when it gets a test.
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/{due-date,skill-label,tool-draft-id,command-query,route-actions,utils,inbox-buttons,recent-chats,refresh-state,theme-resolution,plain-words,artifact-media,artifact-html,conversation-research,runtime-mode,conversation-attachments,memory-explorer,tool-value-sources,team-run-memory,tool-draft-origin,team-run-view}.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 100, branches: 98, functions: 100, lines: 100 },
    },
  },
})
