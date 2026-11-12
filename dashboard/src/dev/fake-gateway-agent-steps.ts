type Json = Record<string, unknown>
type Chat = { id: string; turns: Json[]; messages: { id: string; session_id: string; seq: number; role: 'user' | 'assistant' | 'tool'; content: string; created_at: number; turn_id?: string }[] }

/**
 * Preview-only: one more turn in a chat where Conker searches memory (`conker.recall`) and asks
 * another agent (`conker.run_agent`), recorded as Pi records them: the found items and the other
 * agent's reply are never in the record, only the outcome and the agent's chat.
 */
export function withAgentTools<T extends Chat>(chat: T, start: number): T {
  const turn = 'trn_60000_2', at = start + 60600
  const step = (seq: number, role: 'user' | 'assistant' | 'tool', content: string) => ({
    id: `msg_${(60200 + seq).toString(16).padStart(16, '0')}`, session_id: chat.id, seq, role, content, created_at: at + seq, ...(role === 'user' ? {} : { turn_id: turn }),
  })
  const record = (tool: string, result: Json) => JSON.stringify({ tool, result })
  chat.turns.push({ ...chat.turns[0], id: turn, started_at: at + 7, ended_at: at + 12 })
  const seq = chat.messages.length + 1
  chat.messages.push(
    step(seq, 'user', 'When is my history essay due? Ask the research agent to find two good sources on the Treaty of Versailles.'),
    step(seq + 1, 'assistant', '{"tool":"conker.recall","args":{"query":"history essay deadline"}}'),
    step(seq + 2, 'tool', record('conker.recall', { status: 'found', recallId: `rcl_${'4'.repeat(32)}`, count: 2, outside: false, message: 'Found 2.' })),
    step(seq + 3, 'assistant', '{"tool":"conker.run_agent","args":{"agent":"Research partner","instructions":"Find two reliable sources on the Treaty of Versailles."}}'),
    step(seq + 4, 'tool', record('conker.run_agent', { status: 'done', callId: `acall_${'5'.repeat(32)}`, agentId: `agent_${'1'.repeat(32)}`, agentName: 'Research partner', sessionId: `ses_${'6'.repeat(16)}`, outside: true, message: 'This is Research partner’s reply.' })),
    // Kept under 40 characters: the answer-versions fixture seeds its retries on the first chat ending in a longer answer.
    step(seq + 5, 'assistant', 'Due Friday; two sources in its chat.'),
  )
  return chat
}
