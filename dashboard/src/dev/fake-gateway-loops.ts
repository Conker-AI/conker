/** Development-only open loops: a few promises, his and Conker's, one overdue and one done. Read only, like the browser. */
type Json = Record<string, unknown>
type Request = { query?: Record<string, string | number | boolean | readonly string[]> }

const pad = (value: number) => String(value).padStart(2, '0')
const day = (offset: number) => { const date = new Date(Date.now() + offset * 86_400_000); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
const SEED: [string, 'owner' | 'conker', number | null, 'open' | 'done', string][] = [
  ['Send Maya the invoice', 'owner', -2, 'open', 'Plan my week'],
  ['Check the train times for the tournament', 'conker', 1, 'open', 'Plan my week'],
  ['Book the dentist before the school trip', 'owner', 6, 'open', 'Study group'],
  ['Find a training partner for Thursdays', 'conker', null, 'open', 'Judo'],
  ['Return the library books', 'owner', -5, 'done', 'Study group'],
]

export function fakeOpenLoops(path: string, method: string, options: Request): Json | undefined {
  if (path !== '/api/control/pi/open-loops' || method !== 'GET') return undefined
  const state = String(options.query?.state ?? 'open'), at = Date.now() / 1000
  const items = SEED.map(([text, by, due, loopState, title], index) => ({
    id: `loop_${String(index + 1).repeat(32)}`, sessionId: `ses_${String((index % 3) + 1).repeat(16)}`, sessionTitle: title, messageId: null, quote: null, text, promisedBy: by,
    dueOn: due === null ? null : day(due), overdue: loopState === 'open' && due !== null && due < 0, state: loopState, revision: 1, createdAt: at - 86_400 * (index + 1), updatedAt: at - 3600 * (index + 1),
  })).filter(item => state === 'all' || item.state === state)
  return { today: day(0), timeZone: 'Europe/London', items, nextAfter: null }
}
