import { GitFork, Shield, Search, Copy, Link as LinkIcon } from "lucide-react";
import type { Feature } from "../../platform/contributions";
import type { Session } from "../../domain/model";
import { api } from "../../data/client";
import { refresh } from "../../data/queries";

export const messengerCommands: Feature = {
  id: "messenger.commands", shipped: true,
  commands: [
    { id: "conversation.fork", label: "Fork", icon: GitFork, capability: "fork", available: context => context.selection.kind === "session" || context.selection.kind === "message", handler: async context => {
      const selection = context.selection; if (selection.kind !== "session" && selection.kind !== "message") return;
      const parent = await api<Session>(`/sessions/${selection.sessionId}`);
      const session = await api<Session>("/sessions", { id: crypto.randomUUID(), contactId: parent.contactId, parentId: parent.id, ...(selection.kind === "message" ? { parentMessageId: selection.message.id } : {}) });
      await refresh("sessions", "contacts", "journal"); context.navigate(`/chat/${session.id}`);
    } },
    { id: "message.copy", label: "Copy text", icon: Copy, available: context => context.selection.kind === "message" && !context.selection.message.deleted, handler: async context => { if (context.selection.kind === "message") await navigator.clipboard.writeText(context.selection.message.text); } },
    { id: "message.link", label: "Open message link", icon: LinkIcon, available: context => context.selection.kind === "message", handler: context => { if (context.selection.kind === "message") context.navigate(`/chat/${context.selection.sessionId}#${context.selection.message.id}`); } },
    { id: "conversation.policy", label: "Inspect conversation policy", icon: Shield, capability: "policy", available: context => context.selection.kind === "session", handler: context => { if (context.selection.kind === "session") context.navigate(`/chat/${context.selection.sessionId}?inspect=policy`); } },
    { id: "conversation.deep-search", label: "Deep search", icon: Search, capability: "deep-search", available: context => context.selection.kind === "session", handler: () => {} },
  ],
  placements: [
    { slot: "message.actions", commandId: "conversation.fork", order: 20 }, { slot: "message.actions", commandId: "message.copy", order: 30 }, { slot: "message.actions", commandId: "message.link", order: 40 },
    { slot: "conversation.header", commandId: "conversation.fork" },
    { slot: "composer.tools", commandId: "conversation.policy" }, { slot: "composer.tools", commandId: "conversation.deep-search" },
  ],
  views: [{ id: "record.boundary", slot: "inspector.tabs", label: "Record context", applies: () => true, Component: ({ context }) => <p className="body-copy">This {context.selection.kind === "object" ? context.selection.resource : "conversation"} is a fixture record. Its ID is stable across views. Personality and presentation never widen its authority.</p> }],
};
