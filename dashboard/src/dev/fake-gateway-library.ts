/**
 * Development-only skills and MCP tools for the preview, so their lists (search, sort, filters,
 * select and bulk on/off) can be seen and screenshotted. Writes check the expected revision or
 * digest like Pi and the gateway do.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean> }

const hex = (seed: number) => seed.toString(16).padStart(2, '0').repeat(32)

export function createFakeLibrary(now: () => number, fail: (status: number) => never) {
  const day = 86_400_000
  const skills: Json[] = [
    ['meeting-notes', 'Turn a meeting transcript into decisions, owners and dates.', true, 2],
    ['exam-planner', 'Plan revision blocks backwards from an exam date.', true, 5],
    ['budget-check', 'Compare this month’s spending with the plan and flag surprises.', false, 9],
    ['reading-digest', 'Summarise saved articles into one short weekly digest.', true, 1],
  ].map(([id, description, enabled, age], index) => ({
    id, name: id, description, revision: 1, enabled, sha256: hex(index + 1),
    createdAt: now() - Number(age) * day - day, updatedAt: now() - Number(age) * day,
    markdown: `---\nname: ${id}\ndescription: ${description}\n---\n\n# ${id}\n\nSteps go here.`,
  }))
  const mcpTools: Json[] = [
    ['telegram.messages', 'Telegram messages', 'Read new messages in chosen Telegram chats.', 'active'],
    ['calendar.events', 'Calendar events', 'Read upcoming events from the owner’s calendar.', 'active'],
    ['notion.pages', 'Notion pages', 'Search and read Notion pages shared with Conker.', 'disabled'],
  ].map(([id, name, description, status], index) => ({
    id: `mcp.${id}`, name, description, status, authorization: 'owner_confirmation',
    url: `https://mcp.example.com/${String(id).split('.')[0]}`, tool_name: String(id).split('.')[1],
    schema_hash: hex(index + 20), secret_ref: null, version: 1, digest: hex(index + 40),
  }))
  const metadata = ({ markdown, ...row }: Json) => { void markdown; return row }
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/skills' && method === 'GET') return { schemaVersion: 1, results: skills.map(metadata) }
    if ((match = path.match(/^\/api\/control\/pi\/skills\/([a-z0-9-]{1,64})$/)) && method === 'GET') return skills.find(row => row.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/skills\/([a-z0-9-]{1,64})\/state$/)) && method === 'POST') {
      const skill = skills.find(row => row.id === match![1]) ?? fail(404)
      if (Number(options.body?.expected_revision) !== skill.revision) fail(409)
      skill.enabled = options.body?.enabled === true; skill.revision = Number(skill.revision) + 1; skill.updatedAt = now()
      return skill
    }
    if (path === '/api/owner/mcp/tools' && method === 'GET') return { schemaVersion: 1, tools: mcpTools }
    if ((match = path.match(/^\/api\/owner\/mcp\/tools\/(mcp\.[a-z0-9.-]+)\/state$/)) && method === 'POST') {
      const tool = mcpTools.find(row => row.id === match![1]) ?? fail(404)
      if (options.body?.expected_digest !== tool.digest) fail(409)
      tool.status = options.body?.enabled === true ? 'active' : 'disabled'; tool.version = Number(tool.version) + 1
      tool.digest = hex(Number(tool.version) * 7 + mcpTools.indexOf(tool))
      return { schemaVersion: 1, tool }
    }
    return undefined
  }
}
