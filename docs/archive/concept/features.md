# Feature Inventory

> Complete catalogue of **ideas**, carried over from the prior prototype's concept docs.
> Pure ideas only — no implementation, no architecture, no priority order implied.
> Nothing here is committed. This is the raw material to be grilled, scoped, and decided.

Legend: **[core]** universal layer · **[app]** domain app that owns its own truth ·
**[future]** explicitly speculative in the source material.

---

# Part A — Core platform

## A1. Companion and conversation `[core]`

- One main Companion as the single coherent relationship.
- Conversation continuity across sessions, devices, and surfaces.
- Session list, create, rename, delete, and **fork a conversation**.
- Streaming responses with visible token and tool activity.
- **Multi-message user turns** — the owner decides when a turn is complete, rather than
  every message triggering a response.
- Auto-response toggle; explicit pending/queued state while composing.
- Companion Journal — what it did, why, and on what evidence.
- Proactive briefings — see **A10**, which is where this actually lives.
- Truthful status presentation everywhere (see `principles.md`).

## A2. Memory boundary `[core]`

Controls what the system remembers and why.

- Scoped, reviewable records: preferences · goals · constraints · progress summaries ·
  people and relationship context · project decisions · useful patterns · evidence
  references · procedural skills · Focus Session context.
- Every fact carries: **source → timestamp → confidence → visibility scope → retention
  policy → correction/deletion path**.
- Owner-facing correction, retention, and deletion controls.
- People as scoped **Person Entities** with source-linked facts — never universal
  usefulness, loyalty, trust, or personality scores.
- Explicitly *not*: a dump of every conversation, raw sensor stream, secret, classroom
  recording, or private social message.
- It remembers; it never executes.

## A3. Action boundary `[core]`

Where the system becomes able to do real things.

- Owns tools, connectors, secrets, credentials, permissions, policies.
- Deterministic automations distinct from model-driven action.
- Approval workflows and owner decision inbox.
- Execution, provider communication, audit records, verification, rollback.
- Action lifecycle: `suggested → prepared → awaiting approval → approved → submitted →
  provider accepted → completed → result verified`.
- Redacted action detail in the approval view — enough to judge, never enough to leak.
- One-time verification consumption bound to the exact approved action.
- Actions that always require it: send a message · publish a post · change a calendar ·
  deploy software · spend money · place an order · change firewall rules · access a
  connected account · share health/school/financial data · delete or bulk-edit records.
- It acts; it never decides what the owner values.

## A4. Observation boundary `[core]`

Read-only truth about machines and services.

- Processes · ports · software state · storage and resources · service status · updates ·
  security posture · backups · logs and freshness.
- Never an unrestricted shell or hidden execution backdoor. Changes route through the
  action boundary.
- Must label every value: live · degraded · offline · stale · blocked · empty · planned ·
  unknown.

## A5. Runtime and orchestration `[core]`

- Model turns, sessions, agents, teams.
- **Jobs** — scheduled/cron work: list, create, pause, resume, run-now, delete.
- **Runs**, and future **Flows** and **Loops**.
- Agent, team, skill, flow, and app registry.
- Cross-app scheduling and cross-domain routing.
- Notifications and escalation policy.
- Installable as a clean self-hosted product — not a set of services assembled by hand.
- Must not depend on any development harness being installed.

## A6. Presence and surfaces `[core]`

- Text chat · desktop · mobile · messaging · eventually voice calls.
- **Focus Sessions / Focus Room** — a bounded working context with its own state.
- **Desktop Companion window** — multiple window modes, always-available presence.
- Screen sharing and screen awareness, with explicit share targets and privacy rules.
- Camera awareness.
- Voice: automatic turn-taking *and* manual floor control.
- Independent media controls — camera, screen-share, and avatar toggled separately.
- Pointing and drawing overlays (staged: basic → richer → full).
- Optional avatar / 3D presentation `[future]`.
- Communication-provider routing with an escalation model — a cheap model handles
  conversation, escalating to a stronger one only when needed, avoiding double-model waste.
- **Outbound presence** `[future]`: call the owner with something important, receive calls
  and continue the same conversation, continue work while the owner is away, report back
  on return. Must identify itself as AI, respect consent, and not read sensitive
  information aloud until the owner is authenticated.

## A7. Continuous improvement `[core]`

- Per-response feedback capture from the owner.
- Feedback records tied to concrete artifacts (agent, skill, prompt, tool, automation,
  job, flow, app, dependency).
- Improvement lifecycle: **versioned proposals plus evaluation** — never an agent
  silently rewriting itself.
- Separation of authority between proposer, evaluator, and approver.
- Evaluation system with canaries and rollback.
- Proposal review UI.
- Explicit automatic-update policy.
- Weekly quality job.

## A8. Technology intelligence `[core]`

- Weekly research jobs: global AI research radar · Chinese productization radar ·
  reference refresh · agent/skill quality review · supply-chain update review.
- Pipeline: `original research and releases → adaptation/productization signals →
  primary-source verification`.
- Source access policy and ingestion pipeline.
- Finding records with ranking by usefulness to *this* owner and *this* architecture.
- **Prompt-injection boundary** — ingested external content is data, never instructions.
- Companion delivery, with budgets and a quietness policy.

## A9. Extensibility `[core]`

- Personal app registry with pinning, health checks, and removal.
- Scoped bridge letting the runtime create suggestions and register apps without direct
  database access.
- Local suggestions.
- Character/persona profile that is inspectable and owner-editable — and which
  **never grants permissions**.
- Software supply chain ownership: packages, libraries, containers, SBOMs,
  vulnerabilities, licenses, update ownership.

## A10. Proactive initiative and the daily loop `[core]`

The Companion **opens the conversation**. It is not a thing you remember to query —
it is present, watching, and it tells you what changed. This is the difference between
a chatbot and a companion, and it composes every other capability in Part A.

**The daily talk.** In ordinary conversation, without being asked, it surfaces:

- what changed since you last spoke;
- machine and infrastructure state — services, **ports**, storage, updates, backups,
  security posture, anything newly exposed or newly broken;
- research and news filtered to *your* goals and *this* architecture, not a generic feed;
- opportunities with deadlines approaching;
- unfinished commitments, stalled work, and promises you made;
- things a domain app flagged as worth your attention;
- what it did while you were away, and on what evidence.

**Self-initiated work.** It doesn't only report — it proposes and prepares:

- notices a gap and suggests a thing worth building;
- **builds and deploys on the owner's own server** — services, tools, scripts,
  small apps — as prepared work awaiting approval;
- drafts posts and content for the owner's identities;
- prepares patches, migrations, and remediations;
- proposes schedule changes when goals collide;
- runs jobs and reports results back into the conversation.

**Attention policy.** Proactivity is worthless if it becomes noise, and dangerous if it
becomes autonomy.

- Explicit rules for what interrupts *now* vs. what waits for the next briefing vs. what
  is merely logged.
- A quietness budget — a ceiling on unprompted contact.
- Everything it raises traces back to a source and a memory record; it can always answer
  "why are you telling me this?"
- Everything it prepares stops at the approval boundary. Preparing is free; shipping is not.

> **Open tension, not a settled design.** This capability pulls directly against
> `principles.md` §5 (approval binds to one exact action) and §10 (no autonomous posting,
> messaging, or spending). "The Companion built and deployed something on my server
> because it thought I'd want it" is either the best feature here or the worst, depending
> entirely on where the line sits. Where that line goes is a decision, not a detail.

---

# Part B — Domain apps

## B1. Discipline Operating System `[app]`
*(prior working name: better.io)*

More than a to-do list — connects execution, knowledge, outcomes, and identity.

- **Tasks** (execution) · **Notes and Courses** (knowledge) · **Goals** (outcomes) ·
  **Objects** (identity and measurable concepts) · **append-only Event Stream**
  (behavior) · **Analytics** (cross-entity insight).
- Local-first offline use with background sync.
- Unified semantic **Object Registry**; aliases and typo resolution.
- Goal dashboards as filtered lenses.
- Focus Sessions with proof-of-work feedback.
- **Commitment intelligence** — promises, deadlines, obligations, renegotiation.
- Workspaces, tabs, split panes, saved modes.
- AI-assisted environment provisioning.
- **Pack marketplace**; safe **Extensions** via a mutation sandbox.
- Evidence-based performance resumes.
- Social challenges and a signal-over-noise merit feed.
- Analytics like sleep vs. focus, caffeine vs. procrastination, knowledge vs. execution.

## B2. Business OS and Financial Command Center `[app]`

An AI-operated software company where agents research, build, test, prepare, and report
while the owner reviews the decisions that matter. **Not** blind autonomous company creation.

- Roles: opportunity research · validation · product strategy · design · engineering ·
  marketing · customer support · analytics · finance and operations.
- Financial view: businesses and products · revenue, expenses, profit, runway · users,
  retention, conversion, acquisition · marketing and community feedback · products ready
  to ship · risks, blockers, pending approvals · agent budgets and experiments ·
  investments and lawful financial data · evidence packets for proposed launches.
- Money actions require exact approval, provider-side limits, and settlement verification.
- A separate agent wallet reduces risk but does not make unrestricted autonomous spending
  safe or lawful.

## B3. Training, nutrition, and recovery `[app]`
*(prior working name: BodyMan)*

- Strength, calisthenics, judo · sessions and progressive overload.
- Wearable ingestion (chest-strap HR, fitness trackers).
- Sleep, readiness, recovery.
- Nutrition, meals, macros, fuel timing.
- Mobility, range of motion, balance, niggle tracking.
- Transparent recommendations derived from raw events — answers *"what should I do now,
  and why?"*, and always offers alternatives rather than a command.

## B4. Cooking and Chef Intuition Coach `[app]`

Purpose is intuition, not recipe lookup: understand ingredient function, choose
combinations and substitutions, estimate quantities, control heat and timing, taste and
adjust, cook safely without a fixed recipe.

- Training modes: Heat Guess · Method Guess · Combination Guess · Ingredient Function ·
  Quantity and Proportion · Timeline and Sequencing · Fridge Challenge · Recipe
  Deconstruction · Improvisation Practice · Real Cooking Companion.

## B5. Study Companion and Classroom Memory `[app]`

Distinguishes **what the teacher taught** from what the owner wrote, from official
materials, from what AI explains, from what is independently verified.

- Approved classroom capture; handwriting and board-material understanding.
- Course-specific knowledge bases; classroom-platform integration where authorized.
- Assignment and deadline tracking.
- Teacher-aligned tutoring — *"your course expects method A, though B is common generally."*
- Quizzes, flashcards, exam simulations.
- Hints before full answers; repeated-mistake tracking; source-aware explanations.
- Recording, school accounts, teacher contact, and submissions require consent and lawful
  access.

## B6. Smart Social `[app]`

Separates communication from addictive feeds.
`open notification → open exact conversation → read → reply or draft → close`

- Unified inbox with conversation context.
- Unfinished-reply reminders.
- AI drafting and tone improvement.
- Intentional, bounded browsing.
- Local retention with source and sync status.
- Clear "forget this person" and deletion controls.
- Must never impersonate, automate intimacy, or send autonomously by default.

## B7. Social Manager, Wingman, and Language Coach `[app]` `[future]`

- **Social Manager** — reviews posts, stories, and messages for privacy mistakes, wrong
  audience, accidental sharing, confusing or rude wording, timing problems, and unfinished
  important conversations.
- **Wingman / Conversation Coach** — authorized relationship context, suggested openings,
  draft review, and *teaching the social reasoning* rather than creating dependence.
- **Vocabulary and Communication Coach** — a few useful words per week drawn from real
  writing samples, with meaning, tone, register, and natural use. Never shames non-native
  English. Tracks used naturally / tried but awkward / not yet used.

## B8. Smart FYP `[app]`

Intentional, categorized, time-bounded short-video discovery.

- Combine approved content sources; categorize videos.
- Time and item limits; no autoplay, no infinite continuation.
- End-of-session summaries.
- Save · Explain · Learn More · Send to Someone.
- **LARP Check** — source-aware claim checking that separates fact, opinion, joke,
  prediction, supporting sources, contradicting sources, uncertainty, and the unverifiable.

## B9. Music and vocal practice `[app]`
*(prior working name: Ripeix)*

Principle: **AI at ingestion and interpretation. Math at runtime.**

- Personal library plus streaming-style sources.
- Behavior-based recommendation; listening analytics.
- Deterministic similarity and taste modeling.
- Audio controls and enhancement.
- Karaoke and vocal training: pitch, timing, phrase, and difficulty feedback.
- Returns playlists with confidence and reasons.

## B10. Human Systems Lab `[app]`

Personal experimentation and behavior design — testing safe hypotheses about habits,
attention, energy, learning, emotion, and performance instead of trusting generic
productivity myths.

- Loop: `question → hypothesis → safe experiment → baseline → intervention → measurement
  → analysis → replication → personal operating rule`.
- Stores hypotheses, evidence, consent, conclusions, uncertainty, and versioned operating
  rules.
- Results carry confidence and a replication recommendation.
- **Hard refusals**: pain, coercion, sleep deprivation, starvation, unsafe substances,
  harmful exercise, covert recording, experiments on other people. Goal is understanding
  and safer replacement behavior — never punishment.

## B11. Behavior and context wearable `[app]` `[future]`

- Heart rate and recovery context for the training app.
- Owner-authorized audio or transcripts.
- Habit and communication signals.
- Neutral haptic reminders; Focus Session support.
- Flow: `signal → permission → local/ephemeral processing → uncertain event → owner review
  → scoped memory record → coaching`.
- Pain-based aversion is **not an approved direction**. Interrupt habits with vibration,
  friction, a pause, a blocker, breathing, or a replacement action.

## B12. Public Presence and Identity Manager `[app]`

Manages legitimate separate identities: professional · developer · company and product
brands · project accounts · pen names · topic pseudonyms · community accounts.

- Content ideas, drafts, media assets, content calendars.
- Platform adaptation; approvals and publishing.
- Comments, replies, analytics.
- Privacy and identity-separation checks.
- 2FA, recovery, and exposure warnings.
- Supports lawful pseudonymity. Never impersonation, fake engagement, astroturfing,
  harassment, ban evasion, or deceptive influence.

## B13. Security and Exposure Command Center `[app]`

Defensive only, for systems the owner controls or is explicitly authorized to test.

- Inventory devices, domains, ports, services, repositories, dependencies.
- Find exposed secrets and misconfigurations.
- Review code, containers, infrastructure, permissions.
- Monitor public exposure and impersonation.
- Prepare patches and remediation plans; verify fixes worked.
- Maintain evidence and audit trails.
- Must not scan unrelated targets, expand its own scope, use stolen credentials, deploy
  destructive payloads, or become offensive infrastructure.

## B14. Opportunity Radar `[app]`

Continuously matches opportunities to goals, skills, location, products, schedule, roadmap.

- Hackathons · competitions · grants and scholarships · open-source programs · customers
  and partners · events · technologies and APIs · emerging markets · useful discounts and
  domains.
- Ranked by expected value · eligibility · effort · deadline · risk · evidence quality ·
  strategic fit · preparation required.

## B15. Collaborative calls and the People Graph `[future]`

- Companion joins an authorized call as a **visible, identified AI participant**.
- Shared notes and decisions; live research and technical checks; schedule and opportunity
  context; approved follow-up actions.
- Afterward produces: decisions · open questions · owners · deadlines · created artifacts ·
  follow-ups · approved memory updates.
- Recording, transcription, participant identity, and external follow-ups require consent.

## B16. Live Reality Command Center `[future]`

Explicitly flagged as skeptical in the source. Likely a skill or presentation layer, not a
product.

- `verified facts → observed trends → explicit assumptions → scenario projections →
  uncertainty and possible outcomes`.
- Shows separate scenarios rather than pretending to predict.
- Underlying apps stay authoritative.

---

# Part C — Cross-app behaviour

The point of the whole system is that these compose. Examples from the source material:

```text
Training app publishes today's nutrition target
  → Companion checks available time
  → Cooking app proposes meals and skill practice
  → owner chooses or approves
  → result logged back to the training app
```

```text
Exam deadline + unfinished assignment + training session conflict
  → Companion checks priorities and recovery state
  → proposes a realistic schedule
  → any calendar or message change requires approval
```

```text
Morning gym session detected
  → Companion asks the music app for a high-energy queue matching current taste
  → app returns playlist, confidence, and reasons
```
