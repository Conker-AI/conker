# Conker dashboard

Fixture-only Vite + React frontend on the existing shadcn New York shell.

```sh
npm install
npm run dev -- --host localhost --port 5173 --strictPort
npm run build
```

In a restricted Windows environment where esbuild reports `Cannot read directory "../../..": Access is denied`, use `npm run dev:sandbox`. It keeps Vite's resolver and uses Node to read dependency files. This optional launcher serves the same source at **http://localhost:5173**, with HMR and an ignored cache. The standard launcher remains available. Both build and development use Vite's supported config runner to avoid bundling the config through esbuild.

## Screens and fixtures

| Route                  | Screen                                                         |
| ---------------------- | -------------------------------------------------------------- |
| `/`                    | Companion conversation; shares the weekly session              |
| `/chat`, `/chat/:id`   | Sessions / Agents, five distinct conversation fixtures         |
| `/inbox`, `/inbox/:id` | Requests, proposals, decisions, exact arguments and provenance |
| `/tools`               | Scoped tool registry and sensitivity                           |
| `/memory`              | Evidence, confidence, age, bilingual text search               |
| `/journal`             | Activity with actor filter and source links                    |
| `/jobs`                | Schedules, pause/resume, simulated run receipts                |
| `/system`              | Stale host sample, service evidence, recovery snapshot         |
| `/companion`           | Character form, static portrait import, live form preview      |
| `/terminal`            | Honest offline shell and fixture project context               |
| `/agents`              | Original exemplar retained                                     |

All list screens use `components/data-table.tsx`. Per-screen `data.ts`, `columns.tsx`, and `page.tsx` follow the Agents exemplar. Routes are lazy loaded; the loading indicator is separate from missing records and empty results.

Fixture time is **12 September 2026, 16:43, Asia/Jerusalem**. Relative times and approval deadlines refer to that snapshot. An approval is distinct from execution: Approve once records only a local decision; it never sends mail or deletes files. Proposals do not grant tool permission. The `sent` fixture has an existing delivery receipt; `expired` cannot be approved. The server conversation demonstrates a completed action without a model reply.

Zustand stores keep decisions, job controls, saved profiles, chat drafts, and added messages across navigation. Reload resets the fixture. The composer records user text and an explicit no-model receipt. No model or service requests are made. Portrait imports stay in memory and accept PNG/JPEG/WebP up to 2 MB; animated renderers remain labeled Planned. Terminal remains Offline by design.

## Theme and layout

The header palette button opens the original tweakcn customizer. Theme import, presets, radius, sidebar variant, side, and collapse controls remain available. Customizer choices survive screen navigation; switching sidebar side also preserves the open panel. Green is the default, with semantic tokens throughout the new screens. Warning amber is a semantic `--warning` token in `index.css`. Typography falls back to the system sans stack without an external font request.

## Verification

`npm run build` runs TypeScript and Vite. Existing Tasks and Recharts template type errors were repaired without removing the template's components. The ESLint React Hooks configuration now uses its flat-config export; new Conker screens pass scoped lint. Unused template screens have not been subjected to an unrelated lint rewrite.

Browser smoke scripts use an existing `@playwright/test` installation with Chromium. They introduce no runtime dependency. Start the dev server, then run:

```sh
node scripts/smoke.cjs
node scripts/smoke-customizer.cjs
```

If Playwright is installed elsewhere, set `CONKER_PLAYWRIGHT_MODULE` to that installation's `@playwright/test` directory. Screenshots and diagnostics go to ignored `test-results/`.

Coverage includes all 24 routes (including missing records), desktop/mobile sizing, keyboard row navigation, command search, approval/deny/proposal/history/empty states and badge counts, Russian search, actor deep links, job actions, character saving, composer behavior, theme selection, layout switching, light/dark mode, reset, planned renderers, portrait import, and browser errors/warnings.

Home, Inbox and the reference screens are ready for refinement. The intentional limits are static character rendering, fixture-only jobs and conversations, stale fixture telemetry, and an offline terminal. Backend integration and avatar animation are future work.
