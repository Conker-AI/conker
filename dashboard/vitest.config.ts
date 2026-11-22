import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the pure modules in src/lib (no React, no network). Coverage is measured over the
// modules listed here and the floor only moves up: when a number rises, raise it; add a module here
// when it gets a test.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/{due-date,skill-label,tool-draft-id,command-query,route-actions,utils,inbox-buttons,recent-chats,refresh-state,theme-resolution}.ts',
        'src/lib/{tool-run,tool-workspace,tool-value-sources,tool-draft-origin,team-run-view,team-run-memory,memory-explorer,memory-layout}.ts',
        'src/lib/{conversation-research,conversation-attachments,artifact-html,artifact-media,plain-words,runtime-mode,rich-answer,job-starters,server-actions}.ts',
        'src/lib/chat/{smooth-text,tool-record,tool-requests,turn-details,message-context-rules,prompt-templates,template-fill,turn-outcomes,memory-feedback,template-editor}.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 99, branches: 96, functions: 100, lines: 99 },
    },
  },
})
