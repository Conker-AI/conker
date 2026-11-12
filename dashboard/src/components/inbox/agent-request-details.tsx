import type { AgentRequest, TeamRequest } from '@/lib/gateway/change-requests'

const remembers: Record<AgentRequest['payload']['memory']['scope'], string> = {
  none: 'Nothing', conversation: 'Only the chat it is in', selected: 'Only memories you pick', owner: 'What Conker knows about you',
}

const tools = (ids: readonly string[]) => ids.length ? ids.join(', ') : 'None'

/** A new agent exactly as Conker asked for it: what approving would make, nothing hidden. */
export function AgentDetails({ request }: { request: AgentRequest }) {
  const { payload } = request
  return <dl className="grid gap-3 text-sm">
    <div><dt className="text-xs text-muted-foreground">Tools</dt><dd>{tools(payload.toolIds)}</dd></div>
    <div><dt className="text-xs text-muted-foreground">What it remembers</dt><dd>{remembers[payload.memory.scope]}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Model</dt><dd>{payload.modelId ?? 'Your default model'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Instructions</dt><dd className="whitespace-pre-wrap">{payload.instructions}</dd></div>
    <p className="text-xs text-muted-foreground">Each tool keeps its own access setting. You can change the agent, or archive it, in Agents.</p>
  </dl>
}

/**
 * The agent each role runs on, by name. Pi writes one summary line per role ("1. Role (Agent): …");
 * the payload holds only ids, so a line that does not match falls back to the id.
 */
function agentName(request: TeamRequest, index: number) {
  const role = request.payload.roles[index], prefix = `${index + 1}. ${role.name} (`
  const line = request.summary.split('\n').find(item => item.startsWith(prefix))
  const end = line?.indexOf('): ', prefix.length) ?? -1
  if (line && end > prefix.length) return line.slice(prefix.length, end)
  return role.agentId === 'companion' ? 'Conker' : role.agentId
}

/** A new team: its roles in the order they hand work on, each on an existing agent. */
export function TeamDetails({ request }: { request: TeamRequest }) {
  return <div className="flex flex-col gap-3 text-sm">
    <p className="text-xs text-muted-foreground">Roles, in order</p>
    <ol className="flex flex-col gap-3">{request.payload.roles.map((role, index) => <li key={role.id} className="flex flex-col gap-0.5">
      <p><span className="font-medium">{index + 1}. {role.name}</span> <span className="text-muted-foreground">· {agentName(request, index)}</span></p>
      <p className="whitespace-pre-wrap">{role.instructions}</p>
      <p className="text-xs text-muted-foreground">Tools: {tools(role.toolIds)}</p>
    </li>)}</ol>
    <p className="text-xs text-muted-foreground">Each role hands its result to the next only after you review it. Running the team stays yours, from Teams.</p>
  </div>
}
