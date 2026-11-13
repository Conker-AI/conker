# Product map

One table for where each part of Conker lives. Each row is a product domain. The columns are the
other ways the product is cut: the chat **pillar** it owns (the eight questions a chat answers:
Prompt, Context, Model, Character, Access, Output, Review, Interaction), its **capability
families** in [`capabilities.json`](../../capabilities.json), its **settings topics** in
`dashboard/src/settings/registry/`, and its **Pi packages** (the subpackages of `pi/` in the Pi
repository). Words are defined in the [glossary](glossary.md).

Every capability family, settings topic and pillar appears exactly once, and so does every Pi
package; `tests/test_product_map.py` fails when one is missing, doubled or unknown. An empty cell
is a gap, and a domain whose work sits in another row's package is a candidate to merge.

| Domain | Pillars | Capability families | Settings topics | Pi packages |
|---|---|---|---|---|
| Owner and access | — | `browser-authentication`, `browser-session-administration`, `admin-key-recovery`, `remote-access-tls` | `account`, `you` | `owner` |
| Setup and readiness | — | `setup-status` | — | `setup` |
| Providers | — | `provider-secret-management`, `plan-usage` | — | — |
| Models | Model | `model-configuration` | `models` | `models` |
| Conversations and calls | Prompt, Output, Interaction | `conversations`, `turn-recovery`, `session-privacy`, `typed-calls`, `artifacts` | `chats`, `prompts`, `files`, `voice` | `conversation`, `turns`, `calls`, `content` |
| Agents and character | Character | `agents`, `reusable-skills`, `definitions-list` | `agents` | `agents` |
| Teams | — | `teams-collaboration` | — | — |
| Tools and connectors | — | `tool-inventory`, `tool-workflow-authoring`, `external-mcp-tools` | `tools`, `integrations` | — |
| Permissions and actions | Access | `access-policy`, `owner-approvals`, `change-requests`, `agent-sandbox` | `access`, `inbox` | `actions` |
| Automation | — | `jobs-schedules`, `proposals` | `proactivity`, `notifications` | `schedule` |
| Memory and knowledge | Context | `memory-exploration`, `memory-forgetting`, `memory-corrections` | `memory`, `context` | `memory`, `context` |
| Work management | — | `tasks-activity`, `projects-context` | `projects` | — |
| Search and research | Review | — | `search`, `research` | — |
| System operations | — | `system-status`, `service-lifecycle`, `local-model-download`, `verified-backup`, `held-recovery`, `pinned-updates`, `host-inventory`, `owner-files`, `owner-terminal` | `server` | `host` |
| Audit and economics | — | — | `logs`, `privacy`, `money` | — |
| Delivery adapters | — | — | — | — |
| The interface itself | — | `settings-registry` | `settings`, `appearance`, `accessibility`, `keyboard`, `home`, `day`, `devices`, `labs` | — |
| Shared plumbing | — | — | — | `api`, `core` |

## What the table shows

- **Delivery adapters is empty.** Conker cannot reach the owner outside the browser yet (no push,
  no messaging channel).
- **Search and research and Audit and economics have no capability family.** Web research is a
  ToolGate tool and spending lives in ToolGate's budgets and Pi's daily cap, so neither has its
  own row in `capabilities.json`.
- **Teams has no settings topic or Pi package of its own.** Teams live in Pi's `agents` package
  (`teams.py`, `team_execution.py`); the domain is a merge candidate.
- **Providers has no settings topic.** Provider keys and plans are set on the Providers screen,
  outside the settings registry.
- **The interface itself** holds the settings that only change the dashboard; they belong to no
  service.
