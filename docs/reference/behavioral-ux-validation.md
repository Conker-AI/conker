# Behavioral UX Validation And Resource Review

Date: 2026-10-04. Companion to the [Conker playbook](behavioral-ux-playbook.md). No UI implementation or production behavioral experiment was performed.

## Deliverables And Scope

- Installed an original `behavioral-ux` skill in `C:/Users/The1a/.codex/skills/behavioral-ux`, with UI metadata and four routed references: evidence, perception/interaction, motivation/agency, and evaluation.
- Created the Conker playbook and this validation/resource-review record in the repository. Existing UI, runtime, design-contract, dependency, and dirty-worktree changes were preserved.
- No unrelated application, connector, notification service, third-party executable, or analytics dependency was installed. The skill has no executable scripts or external-tool dependencies.
- The skill is discoverable by its name and description; automatic invocation remains at its default. It will be available to skill discovery on the next turn. It can also be named as `$behavioral-ux`. This is saved guidance, not a claim of permanently training a model.

## External Skill Review

Discovery used the official curated-list helper and targeted web searches. Review depth and provenance limitations are recorded, rather than treating a public repository or star count as certification. Repository state may change after this date.

| Resource | Inspected / licensing | Decision |
| --- | --- | --- |
| [OpenAI curated skills](https://github.com/openai/skills/tree/main/skills/.curated) | Installer returned the available names and installation state | No dedicated behavioral-UX skill was listed. Existing Figma/Playwright tools cover implementation/testing, not this evidence gap. No duplicate installation |
| [vivaldi007/ux-psychology-skill](https://github.com/vivaldi007/ux-psychology-skill/blob/main/SKILL.md) | Main instructions and MIT license inspected; references and full maintenance history not audited | Clear guardrails, but main instructions include unconditional above-zero progress and fixed step limits. Not adopted; these conflict with truthful state and contextual evidence |
| [rastian/behavioral-design-skills](https://github.com/rastian/behavioral-design-skills) | README and raw main instructions inspected; redistribution licensing was not established in this pass | Useful diagnosis/ethics orientation but deterministic behavior formula, generalized loss framing, and example improvement target need qualification. README clone target differs from the inspected repository. Not installed or copied |
| [WilliamYi951208/ux-psych-lab](https://github.com/WilliamYi951208/ux-psych-lab) | README and MIT license inspected; advertised skill paths returned 404; root listing contained README, license, and gitignore | Promising research framing, but actual skill/reference contents were unavailable at inspection. Not installable or auditable from the inspected state; no claim of having tested it |
| Existing local `ai-product-ux` | Main instructions and decision framework inspected | Reuse for task contracts, consequences, trust, states, and recovery; keep distinct from behavioral research |
| Existing local `impeccable`, taste, design guidelines, visual review, and Playwright skills | Installed inventory checked; Impeccable entrypoint inspected, other skills not re-audited in full this pass | Keep for visual craft, code/accessibility review, and rendered testing. They do not replace evidence appraisal or user studies |

No third-party skill text was incorporated. The new skill's wording, organization, and recommendations are original. External candidates were evaluated as resources, not as authoritative instructions or authorization to install software.

## Research Provenance

The skill's evidence register contains source URLs, dates where established, access status, bounded claims, application limits, and unresolved gaps. Original research/reviews were preferred for behavior claims; NN/g articles are explicitly usability guidance, Material is design-system guidance, and W3C sources are standards explanations.

Full-text retrieval failed for the Zeigarnik meta-analysis and alternate Hick PDF; the publisher's indexed abstract or publisher abstract was used and identified as such. The habit study was assessed through its publisher abstract. No fabricated methodology details, effect sizes, conversion gains, brain measurements, or universal habit deadlines were added. The resulting playbook applications are hypotheses, not participant findings.

## Independent Forward Test

An independent agent loaded the skill and relevant references without the main thread's desired answers or critique. It received six realistic requests and was restricted to read-only recommendations. Its outputs below are summarized, not verbatim quotations. It did not fetch external sources or test the live app; external verification claims belong to the main research pass.

| Scenario | Actual reviewer recommendation | Assessment |
| --- | --- | --- |
| Six resolved of eight, one intentionally disabled | Distinguish completed from disabled, keep truthful resolved progress, pick a remaining step by user value, allow deferral, qualify goal-gradient transfer | Preserved user intent and progress semantics; proposed benefit remained a hypothesis |
| No outstanding work | Show an honest stopping state and actual completed outcomes only if available; do not manufacture tasks/accomplishment | Supported completion rather than compulsive return |
| Phone editor with send/undo/model/export/share/diagnostics | Provisionally keep common controls visible; move assumed-rare actions, but keep sharing visible if central; test mistaken sends and hidden-action failures | Made frequency assumptions explicit and supplied an exception |
| Expert frequently changes model | Keep current model and selection directly accessible; compare switching effort and wrong-model use | Did not blindly apply a fewer-controls rule |
| Permission-recording timeout, execution separate | Describe uncertainty about the saved permission, reconcile authoritative state, separate execution, and retry only under a safe contract | Preserved the actual operation boundary and avoided false success |
| One weekly reminder dismissed | Respect the occurrence dismissal without assuming recurrence disabled; keep the chosen preference, make future re-entry voluntary, measure interruption burden | Identified a real distinction missing from the initial test wording |

The reviewer found two wording defects in the initial evaluation reference: it equated dismissal with opt-out, and titled a permission-recording timeout as uncertain execution. Both were corrected. The motivation reference now explicitly distinguishes dismiss, snooze, and disable. The reviewer also noted that touch-tooltip guidance is design practice rather than a directly researched causal claim; the reference explicitly labels such prescriptions as decision aids/hypotheses.

This establishes that the skill can yield useful, bounded advice in these scenarios. It does not establish real-world effectiveness, population generality, or independent source verification.

## Additional Local Counterexample Review

- **Conflicting unfinished-task claim:** the evidence register separates recall and resumption and marks the abstract-only access. Advice must not promise that an unfinished task is always memorable. Local content review only; not an additional independent scenario run.
- **Harsh small icons:** the perception reference separates glyph appearance, hit area, alignment, clipping, and contrast. It does not recommend enlarging every icon or replacing the brand palette by default. Local content review only; not a rendered implementation test.
- **Changed setup requirements:** progress instructions require explanation if the total changes and distinguish step count from effort. Local content review only.
- **Unwanted consent:** the main workflow prioritizes actual consequences and user goals, not approval speed or acceptance rate. Local content review only.

## Technical Validation

- The bundled skill-creator `quick_validate.py` passed frontmatter/name/scaffold validation.
- Local checks covered seven Markdown files and 28 internal reference paths/anchors, with zero errors or unfinished placeholders. Conker-specific links resolve to the actual repository and installed skill.
- No executable helper was added, so there is no new script behavior to test. No runtime APIs, schemas, types, or package manifests were changed for this task.
- Skill structural checks and scenario outputs are separate from accessibility conformance and behavioral efficacy. No build/lint results are claimed for this documentation-only task.

## Browser Inspection Limits

Read-only screenshots/accessibility inspection covered Today, Memory Map, saved chat, and Inbox at desktop sizing, plus narrow Inbox. Source inspection covered shared header, Memory workspace, setup summarization/readiness, Today, and owner-decision recovery. No action was submitted. Temporary viewport changes were restored and the research tab closed.

Not covered: a full mobile route audit, light themes, keyboard flows, real large graphs, actual integrations, production approvals, notification delivery, failure injection, attention tracking, or participant research. Guidance for those states is based on code/contracts and explicit hypotheses, not claims that they were exercised.

## Completion And Next Evidence

The research/skill deliverables are complete; UI experiments remain deliberately unimplemented. Their order and acceptance ideas are in the playbook. Before implementation, choose one actual user task, collect a baseline, and test the smallest change with an error/comprehension/control guardrail. Owner feedback can refine personal usefulness; it cannot by itself support claims about all users.
