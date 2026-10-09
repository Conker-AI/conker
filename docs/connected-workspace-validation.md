# Connected workspace validation — 9 October 2026

Validated on Windows with Python 3.12, Node.js 22, Docker Desktop, local Ollama,
and Chrome through Playwright. The running app is the production dashboard served
by the real Gateway at `https://localhost:18550`.

## Automated checks

- Production build, TypeScript and design guard passed. Production bundle check
  confirmed no fixture chunk. The Gateway entry was 685,026 bytes.
- Full dashboard lint passed; affected-file lint passed after the final changes.
- All 32 dashboard check suites passed, including navigation, conversations,
  memory, tools, owner verification, projects, privacy, calls and new document-tab
  checks. Source reachability: 380/380 modules connected.
- Seven launcher tests passed: existing configuration and credentials retained,
  foreign listeners and mismatched PostgreSQL volumes rejected, stale process
  identity rejected, closed-port handling and unique unprivileged ports.
- Python compilation, capability validation and `git diff --check` passed.
  The source manifest reports 34 active capability families and one deferred.
  That count describes source capabilities, not services enabled in this profile.

Vite reports existing large-chunk warnings and removes misplaced annotations in
Zod dependency comments. These do not prevent the production build.

## Real local acceptance

1. Installed exact published Pi, ToolGate and MemoryGate revisions with separate
   Python environments. Started the dedicated PostgreSQL container and all four
   application services. All five readiness checks passed.
2. Signed in through the local owner UI. Sent a message through the browser and
   received a real `qwen2.5:3b` Ollama answer. The saved conversation contains two
   messages and one completed turn. Its context pane displays the recorded model,
   provider, memory state and unknown cost without inventing a price.
3. Created the project **Conker workspace** through its form and owner-verification
   flow. Its description and durable revision survived browser reload.
4. Memory exploration loaded two actual records and one recorded relationship
   resulting from conversation ingestion. Semantic services are unconfigured;
   this profile uses MemoryGate's explicit lexical fallback.
5. Verified document pinning, keyboard Left/Right navigation, close fallback in
   unit checks, a fresh conversation without the previous chat's content, and
   saved-history navigation. Browser tests verified sidebar collapse/expand and
   that resize keeps the whole active tab, including its controls, visible.
6. Verified the real empty Tools inventory and Inbox state. ToolGate is reachable,
   but no external tools or action scopes have been granted in this installation.
7. Stopped the complete workspace. Status confirmed all five services stopped.
   Restarted it successfully, then verified the project description, saved model
   response and both memory records in the browser. No JavaScript page errors
   occurred during that persistence check.

## Rendered review

Inspected desktop 1440×1000, mobile 390×844 and narrow 320×667 screenshots in
light and dark themes. Covered Chats, Inbox, a project form, saved conversation,
memory graph and conversation context. Also exercised the mobile sidebar.

The review found and corrected setup-footer clipping, a collapsed sidebar
covering the page, and active-tab controls slipping out of view after resizing.
The corrected states were rebuilt and visually rechecked.

Local screenshots, browser scripts and logs are retained under the ignored
`dashboard/output/playwright/` directory. Relevant files include:

- `conversation-desktop-light.png`, `conversation-mobile-dark.png`
- `inbox-desktop-light.png`, `inbox-mobile-320-light.png`
- `project-form-desktop-light.png`, `project-form-mobile-light.png`
- `memory-mobile-light.png`, `context-mobile-dark.png`
- `sidebar-collapsed.png`
- `final-acceptance.js`, `persistence-acceptance.js`, `check-final.log`

This validates the described local profile. It does not establish hosted-provider
sign-in, external tool execution, speech, semantic search, video perception,
production Linux acceptance or a server deployment. See the
[run guide](connected-workspace.md) and [source review](conker-research-2026-10-09.md).
