export function fakeAutoSettings(body: Record<string, unknown> | undefined): Record<string, unknown> {
  // Deterministic stand-in for the routing model: long or comparative asks are Hard; price-like asks research the web.
  const text = String(body?.text ?? ''), hard = text.length > 80 || /compare|best|plan|why/i.test(text), web = /price|latest|best|news|today|buy/i.test(text)
  return { complexity: hard ? 'hard' : 'easy', think: hard, research: web ? 'web' : 'off', reasons: { complexity: hard ? 'This needs careful comparison or planning.' : 'A short, direct question.', think: hard ? 'A background check of the trade-offs helps.' : 'No separate analysis needed.', research: web ? 'Current facts matter here.' : 'Answerable without the web.' }, modelId: 'jev-preview', configurationRevision: 1 }
}

export function fakeContext(path: string, firstMessageId: (sessionId: string) => string | null): Record<string, unknown> | null {
  const sessionId = path.match(/\/api\/control\/pi\/context\/([^\/]+)(?:\/summary)?$/)?.[1]
  if (!sessionId) return null
  
  if (sessionId === 'ses_1111111111111111') {
    if (path.endsWith('/summary')) {
      return { revision: 0, summary: null, source_session_id: null, versions: [] }
    }
    
    const firstId = firstMessageId(sessionId)
    return {
      revision: 1,
      policy: {
        sessionInstructions: 'Keep plans short and practical.',
        messagePolicies: firstId ? { [firstId]: 'keep-exact' as const } : {},
        budget: { contextWindowTokens: 32000, outputReserveTokens: 2000, otherInputTokens: 0 }
      }
    }
  }
  
  if (path.endsWith('/summary')) {
    return { revision: 0, summary: null, source_session_id: null, versions: [] }
  }
  
  return { revision: 0, policy: null }
}