import { useSyncExternalStore } from "react";

export type SessionView = {
  draft: string;
  replyTo?: string;
  scrollTop: number;
  details: Record<string, boolean>;
  scenario: "normal" | "interrupted" | "duplicate" | "lost-ack";
};
const empty: SessionView = {
  draft: "",
  scrollTop: 0,
  details: {},
  scenario: "normal",
};
const views = new Map<string, SessionView>();
const lastSessions = new Map<string, string>();
let contactVersion = 0;
const contactListeners = new Set<() => void>();
const listeners = new Map<string, Set<() => void>>();
export function readView(id: string) {
  return views.get(id) ?? empty;
}
export function updateView(id: string, patch: Partial<SessionView>) {
  views.set(id, { ...readView(id), ...patch });
  listeners.get(id)?.forEach((listener) => listener());
}
export function useSessionView(id: string) {
  return useSyncExternalStore(
    (listener) => {
      const group = listeners.get(id) ?? new Set();
      group.add(listener);
      listeners.set(id, group);
      return () => {
        group.delete(listener);
      };
    },
    () => readView(id),
  );
}
export function rememberContact(contactId: string, sessionId: string) {
  if (lastSessions.get(contactId) === sessionId) return;
  lastSessions.set(contactId, sessionId);
  contactVersion++;
  contactListeners.forEach((listener) => listener());
}
export function useContactVersion() {
  return useSyncExternalStore(
    (listener) => {
      contactListeners.add(listener);
      return () => {
        contactListeners.delete(listener);
      };
    },
    () => contactVersion,
  );
}
export function contactSession(contactId: string, fallback: string) {
  return lastSessions.get(contactId) ?? fallback;
}
