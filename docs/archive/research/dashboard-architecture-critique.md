**I would build a modular React application with explicit contribution points, one shared model of conversations and actions, and a deliberately small shell.** Features should register how they participate; the shell should decide how much attention they receive.

The strongest improvement to the plan is this: **extensibility must preserve coherence, not merely make additions easy.** A toolbar that accepts unlimited registered buttons can become just as unusable as a hard-coded one.

I read the requested documents and design-system sources, plus the current fixture shell and chat. Nothing was changed. The recommendations below are ranked; the cited app patterns are established practice, while the particular architecture and product choices are my proposal.

**1. Make features contribute to a product, rather than turning the product into a plugin host.**

Keep React, Vite, React Router, and the existing design-system package. Build features as ordinary TypeScript modules, bundled with the application and explicitly imported at one composition root. Reject runtime plugin loading, microfrontends, and a custom configuration language for describing entire screens.

For one maintainer, a public plugin runtime would introduce another product to maintain: compatibility rules, installation, lifecycle management, permissions, isolation, and dependency conflicts. Open-source contributors can add compiled feature modules without any of that.

I would borrow these specific ideas:

| Reference | What I would borrow |
|---|---|
| **VS Code** | Separate command definitions from menu placements; make visibility and enablement contextual. A command can appear in several places without several implementations. [Contribution points](https://code.visualstudio.com/api/references/contribution-points) |
| **Obsidian** | Features own cleanup of subscriptions, timers, and event listeners. Disabling or leaving a feature must not leave work running accidentally. [Plugin events](https://docs.obsidian.md/Plugins/Events) |
| **Slack Block Kit** | A bounded vocabulary of structured content rendered by the host. Borrow this for conversation attachments and results, not for generating the whole application. [Block Kit](https://docs.slack.dev/block-kit/) |
| **Linear** | The selected object determines available commands, shared across keyboard, context menu, and command menu. This is an interaction precedent, not a claim about Linear’s internal architecture. [Selecting issues](https://linear.app/docs/select-issues) |

The proposed structure would be:

```text
dashboard/src/
  app/
    bootstrap.tsx
    features.ts              # Explicit list of bundled features
    router.ts
    shell/
  platform/
    contributions.ts         # Typed extension contracts and validation
    commands.ts
    capabilities.ts
    session-view-state.ts
  domain/
    sessions.ts
    participants.ts
    actions.ts
    approvals.ts
    memory.ts
  data/
    client.ts
    adapters/
    queries/
    events/
  features/
    messenger/
    reply/
    fork/
    emotion/
    inbox/
    character-studio/
    ...
  mocks/
    handlers/
    scenarios/
```

`design-system/` continues owning visual primitives, tokens, theme, and evidence-based status. It should not acquire conversation policy, API clients, or feature registrations.

A feature’s public contribution can declare:

- Commands: stable ID, label, contextual availability, handler.
- Placements: references to commands, grouped within named slots.
- Routes: ordinary React Router route objects with lazy components.
- Navigation entries: references to routes, with intentional grouping.
- Content renderers: supported payload type and version.
- Settings or session-state definitions, where needed.

Routes and navigation are related but different. A message permalink needs a route without gaining a sidebar item. React Router already supports route objects and lazy route implementations; the registry should assemble those, not become a second router. [React Router route objects](https://reactrouter.com/start/data/route-object)

Start with a few constrained slots:

| Slot | Contract |
|---|---|
| Message actions | Commands targeting one message |
| Message annotations | Compact, nonessential additions such as an expression |
| Composer tools | Controls affecting the next submission |
| Conversation header | Secondary conversation commands |
| Inspector tabs | Optional detail about the selected object |
| Navigation groups | Destinations within established groups |

Do not initially expose arbitrary “insert anything anywhere” slots.

For example, Reply contributes a message command and a composer attachment. Fork contributes a message/session command and a lineage view. Emotion contributes an annotation renderer and Character Studio settings. None needs to edit the shell.

**The host owns visibility limits.** I would initially allow two direct message actions plus overflow, and keep advanced composer controls behind one tools menu. Registration earns discoverability through search and menus; it does not automatically earn a permanent icon.

Separate four questions that the proposed feature flags currently blur:

1. Is this implementation shipped?
2. Does the connected backend support it?
3. Is this owner authorised to invoke it?
4. Does it apply to this selection?

An unshipped feature can disappear. A previously working capability whose service is down should remain understandable, with a reason. Frontend enablement is presentation; the server still authorises every operation.

Keep approval controls, execution outcomes, and privacy disclosures under core application ownership. Ordinary feature contributions must not replace those renderers. Compiled feature code is trusted application code—TypeScript interfaces are not a security sandbox.

The cost is maintaining contribution contracts, dependency rules, and a small developer diagnostic showing why a command is unavailable. Avoid an event bus through which every feature can secretly influence every other feature.

I would refine the hard rule to: **adding a feature within an existing interaction family requires registration, not shell surgery.** A fundamentally new interaction may justify a new contribution point. Pretending no future idea can require that will produce a sprawling, untyped escape hatch.

**2. Model the relationship, the conversation, and the work separately.**

The messenger model becomes coherent once “contact” stops meaning “one chat” or “one running agent.”

| Concept | Meaning |
|---|---|
| Companion | The owner’s single continuing relationship |
| Agent | A specialist identity with its own configuration and capabilities |
| Contact | A navigable destination targeting the Companion, an agent, or a group |
| Group | A named collection of participants |
| Session | The existing durable conversation, with stable message IDs |
| Run | One execution of work, associated with a session where appropriate |
| Flow / team definition | Instructions or organisation for work; separate from a conversation |

A contact can have many sessions. A session can contain several participants. A workflow can produce a result in a session without becoming a new contact.

That last distinction matters: **do not automatically turn every spawned worker into another person the owner must manage.** Show internal delegation inside the relevant run; promote a specialist or team into contacts when the owner wants a continuing relationship.

For groups, preserve who participated in each run and which definitions were used. Editing today’s group must not reinterpret yesterday’s conversation.

Home and the pinned Companion should resolve through the same destination:

- `/` opens the Companion’s current home session, or its first-conversation state.
- The pinned Companion opens that same destination.
- `/chat/:sessionId` remains the canonical conversation address.
- Chats searches all sessions, including conversations reached from Home.
- Opening another contact resumes its last visited session, with other sessions readily available.

Home should not become a separate dashboard that copies summaries from the messenger. Its distinction can be a quiet landing treatment and a few useful entry points; its conversations remain ordinary sessions.

I would use a persistent navigation area, a messenger list, and the conversation. An inspector opens when requested and replaces space rather than permanently creating a fourth narrow column. On smaller displays, those become successive views.

The switching motion deserves more care than any decorative animation:

- Preserve each session’s draft, reply target, scroll anchor, and open details.
- Continue receiving a running session’s events when another conversation is selected.
- Display cached content immediately; refresh without blanking the conversation.
- Never scroll someone away from what they are reading.
- Do not reorder contacts beneath the pointer whenever an agent emits an event.
- Reserve attention badges for owner-relevant decisions, not internal agent chatter.

The current [fixture chat](../../../dashboard/src/app/chat/components/chat.tsx) clears drafts and local messages on session changes. That is reasonable scaffolding, but it is precisely the behavior the messenger architecture must replace.

**3. Put the fixture seam below the application’s data model.**

I would choose **TanStack Query for server state, React Router for navigation, and a small session-keyed store for local interaction state**. Start that local store with React and typed reducers; there is no demonstrated need for a larger state framework yet.

Keep these categories separate:

| State | Owner |
|---|---|
| Selected session, message permalink, shareable filters | URL |
| Sessions, messages, approvals, actions, memory, capabilities | Query cache |
| Draft, reply target, scroll position, open popover | Local interaction state |
| Saved preferences and effective conversation policy | Backend, observed through queries |

TanStack Query identifies cached resources by query keys. Define those centrally by resource identity, rather than inventing different copies for every screen. [Query-key documentation](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-keys.md)

For example:

```text
["session", sessionId]
["messages", sessionId, filters]     # Cursor-paginated
["action", actionId]
["approval", approvalId]
["inbox", filters]
["memory", memoryId]
```

Chat and Inbox must observe the same approval and action resources. Journal links to those records; it does not manufacture its own version of their outcome.

The data path should be:

```text
Feature → domain query/mutation → API adapter → owner gateway → services
```

The browser should use the existing owner gateway, with server-held credentials. The older “everything goes through Pi” wording must not accidentally put owner approval authority back inside the worker.

Adapters translate service payloads into application types, validate responses, and preserve distinctions such as unknown cost, stale evidence, and unsupported capability. Components should not know which service uses which transport field name.

Move fixtures into **stateful MSW handlers** that exercise the same client and adapters. MSW intercepts requests at the network boundary and supports reuse across development and tests. This makes replacing mocked responses with a real server a transport change rather than a page rewrite. [MSW documentation](https://mswjs.io/docs/)

The fixtures must simulate transitions, not just return pretty objects: delayed acceptance, interrupted streams, rejected approval revisions, expired authority, deleted citations, and dependency failure. Mocking does not prove a backend contract exists; retain contract tests against actual services as they become available.

For streaming, I recommend an acknowledged submission followed by an authenticated SSE subscription. Require stable submission IDs, event IDs, resumable cursors, and a snapshot recovery path. Subscription ownership belongs above the conversation component, so navigating away does not terminate the model’s work.

Optimism should be limited and explicit:

- Immediately show the owner’s message as **sending**.
- Mark it accepted only after server acknowledgement.
- On a lost acknowledgement, resolve the existing submission ID before offering another submission.
- Show approval submission as pending; never optimistically claim execution.
- Distinguish generation stopped, cancellation requested, cancellation confirmed, and an action already dispatched.

Batch token rendering so it does not rerender the whole shell. On reconnection, deduplicate events and recover missing state; do not replay mutation requests to reconstruct the screen.

Configure query retries deliberately. TanStack Query retries failed queries by default; permanent validation failures and expired authentication need different handling from temporary read failures. [Query defaults](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/important-defaults.md)

Also keep its cache freshness separate from your `Status` evidence freshness. Fetching a five-minute-old health report now does not make the underlying observation new.

**4. The likely failure is feature accumulation without shared semantics.**

My single biggest UI-rot prediction is **each feature owning a slightly different meaning of the same thing**: another “running” flag, another permission toggle, another activity card, another copy of an approval.

The result will look modular in the file tree while becoming contradictory in use.

Several parts of the current plan need tightening.

**Conversation controls cannot all be composable booleans.** “Incognito,” memory retrieval, memory writing, transcript retention, and hosted inference interact. Turning off transcript storage does not prevent information entering memory or leaving for a hosted model.

Use a structured conversation policy, with a few understandable presets and inspectable details. Freeze the effective policy on each submitted turn. “Incognito with memory” could mean existing memory is readable while new transcript and memory retention are restricted—but its exact guarantees must be enforceable across the backend before the interface offers that name. Unsupported combinations should explain the conflict.

**Keep eight destinations, but stop treating them as eight independent products.** Chat and Inbox are the daily working surfaces. Memory and Journal are inspection surfaces. Agents, Tools, Jobs, and System are management surfaces. Reuse object inspectors and detail components across them; do not build eight separate systems for filtering, inspecting, and explaining.

**Character Studio should exist now, inside the Companion’s settings.** Reach it from the Companion’s avatar and owner settings rather than adding permanent navigation.

Build name, speaking style, personality configuration, asset import, emotion-pack mapping, and preview. Separate the character profile from its renderer: static portrait today, another renderer later. A neutral fallback should work when an expression or renderer is unavailable. Supporting configuration for later rendering must not imply that rendering already works.

Keep personality separate from permissions. A “bold” companion does not acquire broader authority. Treat an emotion bubble as an expression, not evidence that a model knows the owner’s feelings.

**Keep terminal access as a distinct owner workspace.** A real terminal needs its own authenticated session boundary and explicit connection state. SystemGate remains observation-only. I would defer the bespoke Git client: first provide useful branch, working-tree, and commit context around the terminal, without recreating an IDE. Preview UI should remain explicitly nonfunctional until the shell boundary is built.

**Make onboarding shorter than Character Studio.** Login, confirm the connection, choose a name or accept the default, understand the initial privacy behavior, and reach the first conversation. Character editing can continue afterward. Coaching should attach to stable registered element IDs, be skippable, and survive rearrangement without depending on brittle CSS selectors.

The approvals document also contains two ideas I would explicitly supersede:

- **A connection timeout does not establish that an action never ran.** Its retry example must lead to checking the existing action and potentially showing outcome unknown, not automatically preparing another execution.
- **Undo-send is delayed dispatch, not proof that sending is reversible.** Reversibility claims must describe an actual recovery mechanism.

Keep the accepted standing grants and Ask-AI pre-queue filter. Do not revive the older autonomy dial. Approval detail should explain the applicable bounds and owner-approval floor.

The layered Inbox design is sound, provided the judgement layer contains the material consequences. Recipient, amount, affected resources, and irreversibility must not be buried with debugging details. Approval and execution remain separate facts.

Finally, the existing eight-state `Status` component should remain the evidence renderer. It should not become the entire action state machine: **“outcome unknown” and “reply missing after a confirmed action” require distinct records and distinct recovery controls**, even if both have degraded presentation.

**5. Prove the architecture with one small, deliberately difficult slice.**

I would build one complete messenger journey before expanding the other screens:

1. Companion and one specialist contact, with multiple sessions and a fork.
2. Draft-preserving switching while a response continues streaming.
3. One action appearing consistently in Chat, Inbox, and a minimal Journal view.
4. Approval, rejection, expiration, and connection loss around execution.
5. One memory citation that can resolve to a deletion tombstone.
6. A minimal Character Studio changing the Companion’s name and static expression pack.

Then perform the actual extensibility test: **add Reply and an emotion annotation as separate contributions after that slice works**. The change should touch their feature modules and the composition list, without editing the shell or message-toolbar implementation.

Acceptance should be behavioral:

- Back, refresh, and message links preserve identity.
- Switching conversations loses neither drafts nor incoming work.
- Duplicate stream events do not duplicate messages.
- Missing receipts never become “nothing happened.”
- Removing an optional renderer preserves readable history.
- A failed dependency never appears as an empty collection.
- Keyboard and touch can reach every action.
- Russian and English content fit without truncating decision-critical information.

Use the existing browser tests and mutation-drill approach to prove these invariants. Deliberately break event deduplication, draft isolation, or unknown-outcome rendering and verify the relevant assertion fails.

My proposed frontend performance target is cached conversation switching within roughly 100 ms on the owner’s machine. Measure it separately from model latency. The interface can respond immediately to his input without inventing progress from a model that has not replied.

**6. Ship a responsive web app; add installation before adding native packaging.**

For one maintainer, I would commit to **one responsive web application, with PWA installation where supported**. Installation can provide a separate app window and launcher entry while retaining the same application; support varies by browser and platform. [PWA installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

Desktop-first should mean good keyboard navigation, sensible information density, and useful wide-screen composition. It should not mean mobile is unusable. On mobile, prioritise reading, replying, approving, and inspecting; collapse the same routes into one pane at a time.

Do not equate installable with offline-capable. Initially cache application assets, not the owner’s life records. Offline actions, transcript persistence, logout cleanup, forgetting, and reconnect behavior need explicit policy. Never silently queue an approval for later execution.

I would defer both Electron and Tauri. If a concrete need later requires native integration, I would evaluate **Tauri first** for a thin wrapper, keeping platform operations behind a small adapter. Its use of different system webviews means additional platform testing; it does not eliminate compatibility work. [Tauri webviews](https://v2.tauri.app/reference/webview-versions/)

Electron offers a more controlled browser runtime, but brings a bundled runtime and its security-update responsibilities. That is a real ongoing cost without a present requirement justifying it. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

The architectural checkpoint I would approve is therefore the difficult messenger slice above: registration works, switching feels effortless, and every surface tells the same truth. That is the foundation on which the rest of the owner’s vision can grow.