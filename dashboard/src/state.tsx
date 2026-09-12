import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { sessionFixtures, type Session } from "./fixtures/chat";
import { ownerFixture } from "./fixtures/shared";

type Decision = "approved" | "denied" | "declined" | "accepted";
export type ChatSnapshot = {
  messages: { role: "user" | "assistant"; text: string }[];
  draft: string;
  stream: number;
  replied: boolean;
};
export type PreviewEvent = {
  id: string;
  actor: string;
  summary: string;
  kind: string;
  to: string;
  date: string;
};
type PreviewState = {
  decisions: Record<string, Decision>;
  decide: (id: string, decision: Decision, reason?: string) => void;
  decisionReasons: Record<string, string>;
  chats: Map<string, ChatSnapshot>;
  grantBounds: Record<string, number>;
  changeGrant: (id: string, frequency: number, agentId: string) => void;
  sessions: Session[];
  addSession: (session: Session) => void;
  signedOut: boolean;
  signOut: () => void;
  signIn: () => void;
  events: PreviewEvent[];
  record: (summary: string, kind: string, to: string) => void;
  memoryEdits: Record<string, string>;
  forgottenMemory: string[];
  correctMemory: (id: string, text: string) => void;
  forgetMemory: (id: string) => void;
  jobState: Record<string, { paused: boolean; runs: number }>;
  updateJob: (id: string, state: { paused: boolean; runs: number }) => void;
  profile: { name: string; companion: string; shape: string };
  setProfile: (profile: {
    name: string;
    companion: string;
    shape: string;
  }) => void;
};
const Context = createContext<PreviewState | null>(null);
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [decisionReasons, setDecisionReasons] = useState<
    Record<string, string>
  >({});
  const [grantBounds, setGrantBounds] = useState<Record<string, number>>({});
  const chats = useRef(new Map<string, ChatSnapshot>()).current;
  const [sessions, setSessions] = useState(sessionFixtures);
  const [signedOut, setSignedOut] = useState(false);
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [memoryEdits, setMemoryEdits] = useState<Record<string, string>>({});
  const [forgottenMemory, setForgottenMemory] = useState<string[]>([]);
  const [jobState, setJobState] = useState<
    Record<string, { paused: boolean; runs: number }>
  >({});
  const [profile, setProfile] = useState({
    name: ownerFixture.name,
    companion: ownerFixture.companion,
    shape: "Practical",
  });
  function record(summary: string, kind: string, to: string) {
    setEvents((old) => [
      {
        id: crypto.randomUUID(),
        actor: "You",
        summary,
        kind,
        to,
        date: "2026-09-12",
      },
      ...old,
    ]);
  }
  return (
    <Context
      value={{
        events,
        record,
        memoryEdits,
        forgottenMemory,
        jobState,
        profile,
        setProfile,
        chats,
        decisionReasons,
        grantBounds,
        changeGrant: (id, frequency, agentId) => {
          setGrantBounds((old) => ({ ...old, [id]: frequency }));
          record(
            `Changed ${id} to ${frequency} uses in its existing period · preview only`,
            "Grant",
            `/agents/${agentId}`,
          );
        },
        updateJob: (id, state) =>
          setJobState((old) => ({ ...old, [id]: state })),
        correctMemory: (id, text) => {
          setMemoryEdits((old) => ({ ...old, [id]: text }));
          record("Corrected a fixture memory", "Memory", `/memory/${id}`);
        },
        forgetMemory: (id) => {
          setForgottenMemory((old) => [...old, id]);
          record(
            "Forgot a fixture memory; tombstone retained",
            "Memory",
            `/memory/${id}`,
          );
        },
        decisions,
        decide: (id, decision, reason = "") => {
          if (!decisions[id]) {
            setDecisions((old) => ({ ...old, [id]: decision }));
            setDecisionReasons((old) => ({ ...old, [id]: reason }));
            record(
              `${decision.charAt(0).toUpperCase() + decision.slice(1)} ${id} · preview only${reason ? ` · ${reason}` : ""}`,
              "Decision",
              `/inbox/${id}`,
            );
          }
        },
        sessions,
        addSession: (session) => setSessions((old) => [session, ...old]),
        signedOut,
        signOut: () => setSignedOut(true),
        signIn: () => setSignedOut(false),
      }}
    >
      {children}
    </Context>
  );
}
export function usePreview() {
  const state = useContext(Context);
  if (!state) throw new Error("PreviewProvider is missing");
  return state;
}
