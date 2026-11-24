import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Two test projects. "unit" runs pure modules in node (no DOM, no React rendering, no network): src/lib
// and the plain .ts helpers in src/components, src/settings and the gateway clients, which tests drive
// through a fake request function. Tests live in src/lib/__tests__. "components" renders small
// presentational React components in jsdom with Testing Library; tests live in
// src/components/__tests__, are named *.test.tsx and call cleanup() after each test. Coverage is measured over the modules listed here
// and the floor only moves up: when a number rises, raise it; add a module here when it gets a test.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/lib/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'components', include: ['src/components/**/*.test.tsx'], environment: 'jsdom' } },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/{date-format,due-date,skill-label,tool-draft-id,command-query,route-actions,utils,inbox-buttons,recent-chats,refresh-state,theme-resolution,connection-store}.ts',
        'src/lib/{tool-run,tool-workspace,tool-value-sources,tool-draft-origin,team-run-view,team-run-memory,memory-explorer,memory-layout}.ts',
        'src/lib/{conversation-research,conversation-attachments,artifact-html,artifact-media,plain-words,runtime-mode,rich-answer,job-starters,server-actions}.ts',
        'src/lib/chat/{smooth-text,tool-record,tool-requests,turn-details,message-context-rules,prompt-templates,template-fill,turn-outcomes,memory-feedback,template-editor}.ts',
        'src/lib/api/{model-catalogue,model-roles,context-policy,character,character-defaults}.ts',
        'src/lib/gateway/{claude-models,job-run-words,auto-settings,chatgpt,native-claude,asks,browser-sessions,memory-beliefs,open-loops,plans,search,memory-uses,memory-care,codex-sessions,native-sessions,prompt-enhance,prompt-errors,chat-feature-errors,mcp,skills,proposals,recall-notices,live-preview,turn-usage,filesystem}.ts',
        'src/lib/voice/draft.ts',
        'src/lib/gateway/{access,host-inventory,owner-settings,password-alerts,provider-control,session-policy,tomorrow,updates,workflow-access}.ts',
        'src/lib/gateway/{exports,memory-forget-state,prompt-templates,chat-names,chat-forget,chat-answers,chat-reviews,chat-summary,chat-context,memory-delivery}.ts',
        'src/lib/gateway/{terminal,projects,characters,teams,team-runs}.ts',
        'src/lib/chat/memory-undo.ts',
        'src/components/answer-ui/{fence,format,links}.ts',
        'src/components/brand/service.ts',
        'src/components/gateway/{access-labels,composer-mode,setup-presentation,plain-status,subscription-rules,new-chat-effort}.ts',
        'src/components/inbox/inbox-summary.ts',
        'src/components/resilience/error-details.ts',
        'src/components/gateway/{navigation,home-model,home-resume-model,runtime-state,task-dispatch-state,source-privacy,memory-delivery-watch,runtime-read-deadline,draft-start-recovery}.ts',
        'src/settings/{setting-value,planned}.ts',
        'src/settings/planned-note.tsx',
        'src/components/ui/{alert,badge,empty}.tsx',
        'src/components/brand/identity-mark.tsx',
        'src/components/inbox/{inbox-card,recall-notice-card}.tsx',
        'src/components/resilience/{inline-error,skeletons}.tsx',
        'src/components/gateway/{imported-chats-line,memory-uses-line,open-loops-workspace,thinking-status}.tsx',
        'src/components/{status-badge,message-action-button,reference-section}.tsx',
        'src/components/chat/{chat-feature-error,tool-record}.tsx',
        'src/components/gateway/{mode-chips,system-status,pending-submissions}.tsx',
        'src/components/inbox/{agent-note-card,ask-card,reply-box}.tsx',
        'src/components/design-system/list-card.tsx',
        'src/components/table/data-table-pagination.tsx',
        'src/components/ui/{progress,meter}.tsx',
        'src/settings/setting-row.tsx',
      ],
      reporter: ['text', 'json-summary'],
      // The rendered components have their own floor, measured over the .tsx files above (99.40 / 99.54 /
      // 100 / 100); the floor for everything else is unchanged (measured over the other 120 files: 99.95 / 98.61 / 100 / 100).
      thresholds: { statements: 99, branches: 98, functions: 100, lines: 100, 'src/components/**/*.tsx': { statements: 99, branches: 99, functions: 100, lines: 100 } },
    },
  },
})
