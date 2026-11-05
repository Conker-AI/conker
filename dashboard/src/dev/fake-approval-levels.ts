/**
 * Development-only preview data for approval levels and wrong-password alerts: one request of each
 * shape (level 1 do, level 2 send, level 3 delete with a name, level 3 pay) plus the email to coach and Pi's
 * wrong-password alert routes. Never imported by the production entry.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean>; signal?: AbortSignal; onDispatch?: () => void }

const row = (id: string, title: string, details: string, subjectId: string, args: Json, card: string, level: number, minutes: number): Json => ({
  id, kind: 'verification', title, details, actor: 'Conker', severity: level === 3 ? 'critical' : 'normal', status: 'pending',
  created_at: new Date(Date.now() - minutes * 60000).toISOString(), updated_at: new Date(Date.now() - minutes * 60000).toISOString(), decision: null,
  action: { subject_type: 'tool', subject_id: subjectId, version: 3, args },
  approval: { expires_at: null, consumed_at: null, origin_valid: true }, reviewable: true, unavailable_reason: null, card, approval_level: level,
})

/** One request of each level, newest first: the Inbox shows the password card above them. */
export function fakeApprovalLevels(): Json[] {
  return [
    row('req_project_delete', 'Delete the project “Old drafts”', 'Conker will remove this project and its live references. This cannot be undone.', 'projects.delete',
      { name: 'Old drafts', confirm: true }, 'delete', 3, 2),
    row('req_domain_pay', 'Pay the domain renewal', 'Conker will pay the yearly renewal from your card on file.', 'billing.pay',
      { amount: 14.5, currency: 'USD', item: 'domain yearly renewal' }, 'pay', 3, 9),
    row('req_report_send', 'Send the study report', 'Conker drafted this report and needs your OK before sending it.', 'email.send',
      { to: 'study-group@example.org', subject: 'This week', body: 'Here is what we covered this week.' }, 'send', 2, 20),
    row('req_calendar_read', 'Read next week’s calendar', 'Conker wants to read your calendar to plan around judo.', 'calendar.read',
      { from: 'next monday', to: 'next sunday' }, 'do', 1, 32),
    // Last on purpose: a new approval in the chat preview copies the last row.
    row('req_email_coach', 'Send an email to coach', 'Conker drafted this email and needs your OK before sending it.', 'email.send',
      { to: 'coach@judo-club.example', subject: 'Friday open mat', body: 'Hi coach, is the open mat on Friday still happening? Thanks, Sam' }, 'send', 2, 2),
  ]
}

/** Two unseen wrong-password attempts, newest first; "That was me" clears them for this tab. */
const now = Math.floor(Date.now() / 1000)
const alerts = [
  { at: now - 240, origin: 'new_device', seen: false },
  { at: now - 7200, origin: 'known_device', seen: false },
  { at: now - 86_400, origin: 'signed_in', seen: true },
]
export function fakePasswordAlerts(path: string, options: Request): Json {
  if (path === '/auth/alerts') return { unseen: alerts.filter(alert => !alert.seen).length, results: alerts }
  options.onDispatch?.()
  for (const alert of alerts) alert.seen = true
  return { seen: true }
}
