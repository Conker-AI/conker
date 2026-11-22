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
      include: ['src/lib/{due-date,skill-label,tool-draft-id,command-query,route-actions,utils,inbox-buttons,recent-chats,refresh-state,theme-resolution}.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 95, branches: 90, functions: 100, lines: 95 },
    },
  },
})
