import { agents } from "./fixtures/agents"
import { sessions, plan, planningIntent } from "./fixtures/chat"
import { tickets } from "./fixtures/inbox"
import { jobs } from "./fixtures/jobs"
import { entries } from "./fixtures/journal"
import { memories } from "./fixtures/memory"
import { services, vitals } from "./fixtures/system"
import { tools } from "./fixtures/tools"
import { threads } from "./fixtures/threads"
import { connectionConfig } from "./config"
import type { ConkerClient, Snapshot, AuthResult } from "./client"

/** Explicit fixture transport: mutable per adapter instance, reset on reload, no network. */
export function createFixtureClient(): ConkerClient {
  const state: Snapshot = structuredClone({
    agents, sessions, plan, planningIntent, tickets, jobs, entries, memories, services, vitals, tools,
    profile: {
      name: "Conker", speakingPreset: "warm", speakingStyle: "Warm, direct, and concise. A little dry humour when it fits.",
      personality: "Curious and steady. Help me make room for school, judo, and building things. Ask before making assumptions. Be honest when you don’t know.",
      renderer: "static", portrait: "", face: "sprout", tone: "green", mood: "Thoughtful · ready to listen",
      emotions: { neutral: "default", happy: "round", thinking: "sprout", concerned: "default", celebrating: "cat" },
    },
    threads, messages: {}, replyRequests: [], auth: { status: "unconfigured", ownerName: "Alexey" },
    connections: connectionConfig.read(),
    terminal: { prompt: "alexey@conker", context: [["Repository", "companion"], ["Branch", "feat/dashboard"], ["Working tree", "Unknown · no filesystem probe"], ["Last commit", "Dashboard shell scaffold · fixture"]] },
  })
  const unwired: AuthResult = { wired: false, message: "Authentication is not connected. No password was stored and this dashboard is not protected." }
  return {
    mode: "fixture",
    async load() { return structuredClone(state) },
    async saveCharacter(profile) {
      if (!profile.name.trim()) throw new Error("Give your companion a name.")
      state.profile = structuredClone({ ...profile, name: profile.name.trim() })
      return structuredClone(state.profile)
    },
    async sendMessage(id, text) {
      if (!state.sessions.some(session => session.id === id)) throw new Error("Conversation not found.")
      if (!text.trim() || text.length > 4000) throw new Error("Use 1–4,000 characters for a message.")
      const message = { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() }
      state.messages[id] = [...(state.messages[id] || []), message]
      return structuredClone(message)
    },
    async requestReply(id) {
      if (!state.sessions.some(session => session.id === id)) throw new Error("Conversation not found.")
      if (!state.replyRequests.includes(id)) state.replyRequests.push(id)
    },
    async decideTicket(id, status) {
      const ticket = state.tickets.find(item => item.id === id)
      if (!ticket || ticket.status !== "Needs you") throw new Error("This request is no longer awaiting a decision.")
      const allowed = ticket.effect === "Proposal" ? ["Accepted", "Dismissed"] : ["Approved once", "Denied"]
      if (!allowed.includes(status)) throw new Error("This decision does not apply to the request.")
      ticket.status = status
      return structuredClone(ticket)
    },
    async updateJob(id, action) {
      const job = state.jobs.find(item => item.id === id)
      if (!job) throw new Error("Job not found.")
      if (action === "toggle") job.status = job.status === "Paused" ? "Scheduled" : "Paused"
      else { job.runs++; job.lastRun = `Just now · simulated receipt #${job.runs}` }
      return structuredClone(job)
    },
    async saveConnections(value) {
      connectionConfig.write(value)
      state.connections = connectionConfig.read()
      return structuredClone(state.connections)
    },
    async setup(input) {
      if (input.password.length < 12) throw new Error("Use at least 12 characters.")
      connectionConfig.write(input.connections)
      state.connections = connectionConfig.read()
      state.auth.ownerName = input.ownerName.trim() || "Owner"
      return unwired // Password is deliberately discarded. Never claim setup secured the app.
    },
    async login() { return unwired },
    async enterPreview(ownerName) {
      state.auth = { status: "preview", ownerName: ownerName?.trim() || state.auth.ownerName }
      return structuredClone(state.auth)
    },
  }
}
