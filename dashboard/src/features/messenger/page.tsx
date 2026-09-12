import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Plus,
  Search,
  Square,
  X,
} from "lucide-react";
import { Popover } from "radix-ui";
import type {
  CharacterProfile,
  Citation,
  Contact,
  Message,
  Run,
  Session,
} from "../../domain/model";
import {
  Button,
  Input,
  Status,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../ui";
import { api } from "../../data/client";
import { useList, useObject, keys, refresh } from "../../data/queries";
import { runs } from "../../data/runs";
import {
  contactSession,
  useContactVersion,
  rememberContact,
  useSessionView,
  updateView,
  readView,
} from "../../platform/session-view-state";
import { Slot, CommandSearch } from "../../platform/slots";
import {
  QueryState,
  ObjectInspector,
  DetailFields,
} from "../../components/object-inspector";
import { ActionRecord } from "../../components/action-record";
import { Portrait } from "../character-studio/portrait";
import { useChromePreference } from "../../platform/chrome-preferences";

export function Home() {
  const query = useObject<Contact>("contacts", "home");
  return query.data ? (
    <Navigate
      to={`/chat/${contactSession("home", query.data.sessionIds[0])}`}
      replace
    />
  ) : (
    <QueryState loading={query.isPending} error={query.error} />
  );
}
function ContactList({ compact = false }: { compact?: boolean }) {
  useContactVersion();
  const query = useList<Contact>("contacts");
  const sessions = useList<Session>("sessions");
  const character = useObject<CharacterProfile>("character", "companion");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("sessions");
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: (contactId: string) =>
      api<Session>("/sessions", { id: crypto.randomUUID(), contactId }),
    onSuccess: async (session) => {
      await refresh("sessions", "contacts");
      navigate(`/chat/${session.id}`);
      setCreating(false);
    },
  });
  const ordered = [...(sessions.data ?? [])].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  const latestHome = ordered.find((session) => session.contactId === "home");
  const entries =
    mode === "sessions"
      ? ordered
          .sort(
            (a, b) =>
              Number(b.id === latestHome?.id) - Number(a.id === latestHome?.id),
          )
          .map((session) => ({
            id: session.id,
            title: session.title,
            subtitle: `${query.data?.find((c) => c.id === session.contactId)?.name ?? "Conversation"}${session.id === latestHome?.id ? " · pinned" : ""}`,
            to: `/chat/${session.id}`,
            home: session.id === latestHome?.id,
          }))
      : [...(query.data ?? [])]
          .sort((a, b) => Number(b.id === "home") - Number(a.id === "home"))
          .map((contact) => ({
            id: contact.id,
            title:
              contact.id === "home"
                ? (character.data?.name ?? contact.name)
                : contact.name,
            subtitle:
              contact.id === "home"
                ? "Your companion · pinned"
                : contact.subtitle,
            to: `/chat/${contactSession(contact.id, contact.sessionIds[0])}`,
            home: contact.id === "home",
          }));
  const visible = entries.filter((entry) =>
    `${entry.title} ${entry.subtitle}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <aside
      className="contact-pane"
      aria-label={compact ? "Conversation contacts" : "Chats list"}
    >
      <header>
        <h1>Chats</h1>
        <span className="fine-print">A place for every conversation</span>
      </header>
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList aria-label="Conversation filter">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="contact-search">
        <Search />
        <Input
          aria-label="Search contacts and conversations"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Button
        variant="ghost"
        onClick={() => setCreating(!creating)}
        aria-expanded={creating}
      >
        <Plus />
        New conversation
      </Button>
      {creating && (
        <div aria-label="Choose a contact" className="stack">
          {query.data?.map((contact) => (
            <Button
              key={contact.id}
              variant="outline"
              disabled={create.isPending}
              onClick={() => create.mutate(contact.id)}
            >
              Start with {contact.name}
            </Button>
          ))}
          {create.error && <p role="alert">{create.error.message}</p>}
        </div>
      )}
      {query.isPending ||
      sessions.isPending ||
      query.error ||
      sessions.error ? (
        <QueryState
          loading={query.isPending || sessions.isPending}
          error={query.error ?? sessions.error}
        />
      ) : visible.length ? (
        visible.map((entry) => (
          <Link
            key={entry.id}
            className="session-item"
            to={entry.to}
            aria-label={entry.home ? "Open Companion home" : undefined}
          >
            <strong>{entry.title}</strong>
            <small>{entry.subtitle}</small>
          </Link>
        ))
      ) : (
        <QueryState empty="No matching conversations or contacts." />
      )}
      <footer>
        <p>No extra people to manage.</p>
        <small>Temporary workers stay inside the run.</small>
      </footer>
    </aside>
  );
}
export function Messenger() {
  const { sessionId } = useParams();
  const [contactsHidden] = useChromePreference("contactsHidden");
  return (
    <div
      className={`messenger ${sessionId ? "has-conversation" : "shows-contacts"}`}
    >
      {(!sessionId || !contactsHidden) && <ContactList compact={!!sessionId} />}
      {sessionId && <Conversation key={sessionId} id={sessionId} />}
    </div>
  );
}
function RunDetail({ id }: { id: string }) {
  const query = useObject<Run>("runs", id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function operate(operation: "stop" | "recover") {
    setBusy(true);
    try {
      await runs[operation](id);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!query.data) return null;
  const run = query.data;
  return (
    <div className="run-detail" data-run-state={run.status}>
      {run.status === "interrupted" && (
        <>
          <Status
            evidence={{
              state: "degraded",
              detail:
                "Stream interrupted. Generation may still be running; the visible reply is incomplete.",
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void operate("recover")}
          >
            Recover existing run
          </Button>
        </>
      )}
      {(run.status === "streaming" || run.status === "accepted") && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void operate("stop")}
        >
          <Square />
          {busy ? "Cancellation requested" : "Stop reply"}
        </Button>
      )}
      {run.status === "stopped" && (
        <Status
          evidence={{
            state: "blocked",
            detail:
              "Generation stopped in the fixture. Already completed actions are unaffected.",
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>
          {run.model}{" "}
          <span className="fine-print">
            · {run.costUsd === null ? "cost unknown" : `$${run.costUsd}`}
          </span>
        </summary>
        <div className="stack">
          <p className="fine-print">
            Run {run.id} · participants at submission:{" "}
            {run.participantSnapshot.agentIds.join(", ")}
            {run.participantSnapshot.groupRevision &&
              ` · group revision ${run.participantSnapshot.groupRevision}`}
          </p>
          <p className="fine-print">
            Policy frozen on this run: {run.policy.id}. Personality is a
            conversational lens, not a grant.
          </p>
          {run.delegations.map((worker) => (
            <p key={worker.id}>
              Delegated: {worker.task}
              <br />
              <small>{worker.outcome}</small>
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}
function CitationLink({ id }: { id: string }) {
  const query = useObject<Citation>("citations", id);
  if (!query.data)
    return <QueryState loading={query.isPending} error={query.error} />;
  const citation = query.data;
  return (
    <div className="citation">
      {citation.deleted ? (
        <Status
          evidence={{
            state: "empty",
            detail:
              "Source message was forgotten. Its text is no longer available.",
          }}
        />
      ) : (
        <Link to={`/chat/${citation.sessionId}#${citation.messageId}`}>
          ↗ Source: {citation.excerpt}
        </Link>
      )}
    </div>
  );
}
function MessageRow({ message }: { message: Message }) {
  const [error, setError] = useState("");
  const selection = {
    kind: "message" as const,
    sessionId: message.sessionId,
    message,
  };
  return (
    <article
      className={`messenger-message role-${message.role}`}
      id={message.id}
      data-message-id={message.id}
    >
      <header>
        <strong>{message.author}</strong>
        <time>{message.createdAt}</time>
        <Slot name="message.annotations" selection={selection} />
      </header>
      {message.deleted ? (
        <Status
          evidence={{
            state: "empty",
            detail:
              "This message was forgotten. A content-free tombstone remains.",
          }}
        />
      ) : (
        <>
          <p className="message-body">{message.text || "…"}</p>
          {message.replyTo && (
            <Link
              className="reply-reference"
              to={`/chat/${message.sessionId}#${message.replyTo}`}
            >
              ↳ In reply to an earlier message
            </Link>
          )}
        </>
      )}
      {message.delivery === "sending" && (
        <Status
          evidence={{
            state: "unknown",
            detail: "Sending · waiting for acceptance.",
          }}
        />
      )}
      {message.delivery === "unknown" && (
        <>
          <Status
            evidence={{
              state: "degraded",
              detail:
                "Acceptance unknown. Check the existing submission before sending again.",
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await runs.resolveSubmission(message.id);
              } catch (cause) {
                setError(String(cause));
              }
            }}
          >
            Check submission
          </Button>
        </>
      )}
      {message.actionIds?.map((id) => (
        <ActionRecord key={id} id={id} />
      ))}
      {message.citationIds?.map((id) => (
        <CitationLink key={id} id={id} />
      ))}
      {message.runId && <RunDetail id={message.runId} />}
      {error && <p role="alert">{error}</p>}
      <Slot name="message.actions" selection={selection} />
    </article>
  );
}
function Conversation({ id }: { id: string }) {
  const [contactsHidden, setContactsHidden] =
    useChromePreference("contactsHidden");
  const query = useObject<Session>("sessions", id);
  const contact = useObject<Contact>("contacts", query.data?.contactId ?? "");
  const sessions = useList<Session>("sessions");
  const character = useObject<CharacterProfile>("character", "companion");
  const messages = useQuery<Message[]>({
    queryKey: keys.messages(id),
    queryFn: () => api(`/messages/${id}`),
  });
  const view = useSessionView(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(false);
  const [sending, setSending] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api<Session>("/sessions", {
        id: crypto.randomUUID(),
        contactId: query.data!.contactId,
      }),
    onSuccess: async (session) => {
      await refresh("sessions", "contacts");
      navigate(`/chat/${session.id}`);
    },
  });
  useEffect(() => {
    if (query.data) rememberContact(query.data.contactId, id);
  }, [id, query.data]);
  useLayoutEffect(() => {
    if (!messages.data || !scroller.current) return;
    const target =
      location.hash &&
      document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ block: "center" });
    else scroller.current.scrollTop = readView(id).scrollTop;
  }, [id, !!messages.data, location.hash, params.get("inspect")]);
  useLayoutEffect(() => {
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages.data]);
  async function send() {
    if (!view.draft.trim() || sending) return;
    const text = view.draft.trim();
    setSending(true);
    nearBottom.current = true;
    updateView(id, { draft: "", replyTo: undefined });
    await runs.submit(id, text, view.replyTo, view.scenario);
    setSending(false);
  }
  if (!query.data)
    return (
      <div className="conversation-pane">
        <QueryState loading={query.isPending} error={query.error} />
      </div>
    );
  const session = query.data;
  return (
    <section className="conversation-pane" aria-label="Conversation">
      <div className="conversation-chrome">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setContactsHidden(!contactsHidden)}
          aria-expanded={!contactsHidden}
        >
          {contactsHidden ? "Show contacts" : "Hide contacts"}
        </Button>
      </div>
      <header className="conversation-header">
        <Button
          className="back-to-contacts"
          variant="ghost"
          size="icon"
          asChild
        >
          <Link to="/chat" aria-label="Back to chats">
            <ArrowLeft />
          </Link>
        </Button>
        {session.contactId === "home" ? (
          <Link to="/companion" aria-label="Companion settings">
            <Portrait profile={character.data} />
          </Link>
        ) : (
          <span className="contact-avatar">{contact.data?.initials}</span>
        )}
        <div className="conversation-identity">
          <h2>{contact.data?.name ?? "Conversation"}</h2>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="ghost" size="sm">
                {session.title}
                <ChevronDown />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="session-popover"
                sideOffset={8}
                align="start"
                aria-label="Contact sessions"
              >
                <p className="list-label">
                  Conversations with {contact.data?.name}
                </p>
                {sessions.data
                  ?.filter((s) => s.contactId === session.contactId)
                  .map((s) => (
                    <Popover.Close asChild key={s.id}>
                      <Link className="session-item" to={`/chat/${s.id}`}>
                        <strong>{s.title}</strong>
                        <small>
                          {s.parentId
                            ? "Forked conversation"
                            : "Retained session"}
                        </small>
                      </Link>
                    </Popover.Close>
                  ))}
                <Button
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={() => create.mutate()}
                >
                  <Plus />
                  New conversation
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <div className="conversation-header-actions">
          <Slot
            name="conversation.header"
            selection={{ kind: "session", sessionId: id }}
          />
          <CommandSearch selection={{ kind: "session", sessionId: id }} />
        </div>
      </header>
      {params.get("inspect") === "policy" ? (
        <div className="conversation-scroll">
          <Button variant="ghost" onClick={() => setParams({})}>
            <ArrowLeft />
            Back to conversation
          </Button>
          <ObjectInspector
            resource="sessions"
            id={id}
            title="Effective conversation policy"
          >
            <DetailFields
              fields={[
                { label: "Inference", value: "Local only" },
                { label: "Transcript", value: "Retained in this fixture" },
                {
                  label: "Memory",
                  value: "Existing memories readable; new evidence retained",
                },
              ]}
            />
            <p className="body-copy">
              Every run freezes this policy at submission. Incognito-with-memory
              is not offered until its retention guarantees exist.
            </p>
          </ObjectInspector>
        </div>
      ) : (
        <div
          className="conversation-scroll"
          ref={scroller}
          data-testid="conversation-scroll"
          onScroll={(event) => {
            const el = event.currentTarget;
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            updateView(id, { scrollTop: el.scrollTop });
          }}
        >
          <div className="message-column">
            {session.parentId && (
              <div className="fork-note">
                <Link
                  to={`/chat/${session.parentId}${session.parentMessageId ? `#${session.parentMessageId}` : ""}`}
                >
                  ↳ Parent conversation
                </Link>
                <p>{session.summary}</p>
              </div>
            )}
            <div className="conversation-date">Saturday, 12 September</div>
            {!messages.data ? (
              <QueryState loading={messages.isPending} error={messages.error} />
            ) : messages.data.length ? (
              messages.data.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))
            ) : (
              <div className="quiet-conversation">
                <Portrait profile={character.data} size="large" />
                <h2>Start anywhere.</h2>
                <p>It doesn’t have to be a well-formed thought.</p>
                <Status
                  evidence={{ state: "empty", detail: "A fresh conversation." }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      <div className="messenger-composer">
        <Slot
          name="composer.tools"
          selection={{ kind: "session", sessionId: id }}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Message"
            placeholder={`Message ${contact.data?.name ?? "your companion"}…`}
            maxLength={16000}
            rows={2}
            value={view.draft}
            onChange={(e) => updateView(id, { draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!view.draft.trim() || sending}
          >
            <ArrowUp />
          </Button>
        </form>
        <div className="composer-caption">
          <span>Local fixture · no model or real action</span>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="ghost" size="sm">
                Preview scenario
                <ChevronDown />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="session-popover"
                aria-label="Fixture scenarios"
              >
                <label>
                  Next submission
                  <select
                    aria-label="Next submission scenario"
                    value={view.scenario}
                    onChange={(e) =>
                      updateView(id, {
                        scenario: e.target.value as typeof view.scenario,
                      })
                    }
                  >
                    <option value="normal">Delayed acceptance</option>
                    <option value="interrupted">Interrupted stream</option>
                    <option value="duplicate">Duplicate stream events</option>
                    <option value="lost-ack">Lost acceptance response</option>
                  </select>
                </label>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await api("/citations/training/delete", {});
                    await refresh("citations", "messages", "journal");
                  }}
                >
                  Preview deleted citation
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </section>
  );
}
