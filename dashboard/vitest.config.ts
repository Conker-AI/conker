import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for pure modules (no DOM, no React rendering, no network): src/lib and the plain .ts
// helpers in src/components, src/settings and the gateway clients, which tests drive through a fake
// request function. Tests live in src/lib/__tests__. Coverage is measured over the modules listed
// here and the floor only moves up: when a number rises, raise it; add a module here when it gets a test.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/{due-date,skill-label,tool-draft-id,command-query,route-actions,utils,inbox-buttons,recent-chats,refresh-state,theme-resolution,connection-store}.ts',
        'src/lib/{tool-run,tool-workspace,tool-value-sources,tool-draft-origin,team-run-view,team-run-memory,memory-explorer,memory-layout}.ts',
        'src/lib/{conversation-research,conversation-attachments,artifact-html,artifact-media,plain-words,runtime-mode,rich-answer,job-starters,server-actions}.ts',
        'src/lib/chat/{smooth-text,tool-record,tool-requests,turn-details,message-context-rules,prompt-templates,template-fill,turn-outcomes,memory-feedback,template-editor}.ts',
        'src/lib/api/{model-catalogue,model-roles,context-policy,character,character-defaults}.ts',
        'src/lib/gateway/{claude-models,job-run-words,auto-settings,chatgpt,native-claude,asks,browser-sessions,memory-beliefs,open-loops,plans,search,memory-uses,memory-care,codex-sessions,native-sessions,prompt-enhance,prompt-errors,chat-feature-errors,mcp,skills,proposals,recall-notices,live-preview,turn-usage,filesystem}.ts',
        'src/lib/voice/draft.ts',
        'src/components/answer-ui/{fence,format,links}.ts',
        'src/components/brand/service.ts',
        'src/components/gateway/{access-labels,composer-mode,setup-presentation,plain-status,subscription-rules,new-chat-effort}.ts',
        'src/components/inbox/inbox-summary.ts',
        'src/components/resilience/error-details.ts',
        'src/components/gateway/{navigation,home-model,home-resume-model,runtime-state,task-dispatch-state,source-privacy,memory-delivery-watch,runtime-read-deadline,draft-start-recovery}.ts',
        'src/settings/setting-value.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 99, branches: 98, functions: 100, lines: 100 },
    },
  },
})
