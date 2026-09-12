import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowUp,
  CalendarDays,
  GitFork,
  List,
  Plus,
  Square,
  CornerDownRight,
  ArrowRight,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Status,
  Input,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Badge,
} from "../ui";
import { usePreview } from "../state";
import {
  planningFixture,
  reminderReceiptFixture,
  sourceMessageFixtures,
} from "../fixtures/chat";
import { demoReply, fixtureLive } from "../fixtures/shared";
import { PageHeading, Mark, EmptyState } from "../components/common";

export function Chat() {
  const { sessionId } = useParams();
  return <ChatThread key={sessionId} />;
}
function ChatThread() {
  const { sessionId } = useParams();
  const { sessions, addSession, decisions, chats, profile } = usePreview();
  const saved = chats.get(sessionId ?? "");
  const session = sessions.find((s) => s.id === sessionId);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState(saved?.draft ?? "");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >(saved?.messages ?? []);
  const [stream, setStream] = useState(saved?.stream ?? 0);
  const [streaming, setStreaming] = useState(false);
  const [replied, setReplied] = useState(saved?.replied ?? false);
  const bottom = useRef<HTMLDivElement>(null);
  // Keep the visible reply, including a stopped partial stream, when visiting another screen.
  const snapshot = useRef({ messages, draft, stream, replied });
  snapshot.current = { messages, draft, stream, replied };
  useEffect(
    () => () => {
      chats.set(sessionId ?? "", snapshot.current);
    },
    [chats, sessionId],
  );
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(
      () =>
        setStream((value) => {
          if (value >= demoReply.length) {
            setStreaming(false);
            return value;
          }
          return value + 4;
        }),
      22,
    );
    return () => clearInterval(timer);
  }, [streaming]);
  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || streaming) return;
    setMessages((old) => [
      ...old,
      ...(stream
        ? [{ role: "assistant" as const, text: demoReply.slice(0, stream) }]
        : []),
      { role: "user", text: draft.trim() },
    ]);
    setDraft("");
    setStream(0);
    setStreaming(true);
    setTimeout(
      () =>
        bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      80,
    );
  }
  function create(fork = false) {
    const id = "preview-" + crypto.randomUUID();
    addSession({
      id,
      title: fork ? `A branch of ${session?.title}` : "A fresh conversation",
      date: "Just now",
      mode: "quiet",
      ...(fork && session
        ? {
            parent: session.id,
            summary:
              "A fixture branch: keep training days light and make space for the exam.",
          }
        : {}),
    });
    navigate(`/chat/${id}`);
    setHistoryOpen(false);
  }
  if (!session)
    return (
      <div className="page">
        <EmptyState title="That conversation isn’t in this preview.">
          <Link to="/chat/week">Return to your week</Link>
        </EmptyState>
      </div>
    );
  return (
    <div className="chat-page">
      <PageHeading
        eyebrow="The daily loop"
        title="A place to think out loud."
        description="Plans, loose ends, whatever’s on your mind."
      >
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost">
              <List />
              Conversations
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Your conversations</SheetTitle>
              <SheetDescription>
                Separate threads. Room to change direction.
              </SheetDescription>
            </SheetHeader>
            <div className="sheet-body">
              <Input
                aria-label="Search conversations"
                placeholder="Find a conversation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {sessions
                .filter((s) =>
                  s.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((s) => (
                  <Link
                    className="session-item"
                    key={s.id}
                    to={`/chat/${s.id}`}
                    onClick={() => setHistoryOpen(false)}
                  >
                    <strong>{s.title}</strong>
                    <small>
                      {s.date}
                      {s.parent && " · forked conversation"}
                    </small>
                  </Link>
                ))}
            </div>
          </SheetContent>
        </Sheet>
        <Button variant="outline" onClick={() => create()}>
          <Plus />
          New chat
        </Button>
      </PageHeading>
      <div className="thread">
        <div className="thread-heading">
          <h2>{session.title}</h2>
          <Button size="sm" variant="ghost" onClick={() => create(true)}>
            <GitFork />
            Fork
          </Button>
        </div>
        {session.parent && (
          <div className="fork-note">
            <CornerDownRight />
            <Link to={`/chat/${session.parent}`}>Parent conversation</Link>
            <p>{session.summary}</p>
          </div>
        )}
        {sourceMessageFixtures[session.id] && (
          <article
            className="message user-message"
            id={sourceMessageFixtures[session.id].id}
          >
            <div className="message-label">
              You <span>{sourceMessageFixtures[session.id].date}</span>
            </div>
            <p>{sourceMessageFixtures[session.id].text}</p>
          </article>
        )}
        <p className="date-divider">Saturday, 12 September</p>
        {session.mode === "plan" && (
          <>
            <article className="message user-message" id="intent">
              <div className="message-label">
                You <time>16:42</time>
              </div>
              <p>{planningFixture.intent}</p>
            </article>
            <article className="message assistant-message">
              <div className="message-label">
                <Mark small />
                {profile.companion}
              </div>
              <details className="tool-event">
                <summary>
                  <CalendarDays />
                  <span>
                    <strong>Checked your week</strong>
                    <small>calendar.read · 3 events · nothing changed</small>
                  </span>
                  <span className="disclosure-label">Details</span>
                </summary>
                <div className="detail-body">
                  <Status
                    evidence={fixtureLive(planningFixture.tool.outcome)}
                  />
                  <pre>
                    {JSON.stringify(planningFixture.tool.args, null, 2)}
                  </pre>
                  <p className="fine-print">
                    {planningFixture.tool.actionId} ·{" "}
                    {planningFixture.tool.duration}
                  </p>
                </div>
              </details>
              <p className="reply-text">{planningFixture.reply}</p>
              <div className="week-plan">
                {planningFixture.plan.map((row) => (
                  <div className="plan-row" key={row.day}>
                    <div className="day-tile">
                      <small>{row.day}</small>
                      <strong>{row.date}</strong>
                    </div>
                    <div>
                      <strong>{row.title}</strong>
                      <p>{row.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p>
                I’ve drafted the message to coach. Have a look before anything
                leaves here.
              </p>
              <Card className="parked-card">
                <CardHeader>
                  <CardTitle>
                    <h3>
                      {decisions.coach
                        ? "Your decision is recorded"
                        : "One message, waiting for your say"}
                    </h3>
                  </CardTitle>
                  <CardDescription>
                    {decisions.coach
                      ? "This preview records the decision only. No email was sent."
                      : "To coach Daniel · Is Friday’s open mat on?"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Status
                    evidence={{
                      state: "blocked",
                      detail: decisions.coach
                        ? "Execution is not connected in this preview."
                        : "Parked turn · nothing has been sent.",
                    }}
                  />
                  <Button asChild variant="outline">
                    <Link to="/inbox/coach">
                      {decisions.coach ? "View decision" : "Review in Inbox"}
                      <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
              <p className="model-note">
                Local · Qwen 2.5 3B · cost unknown{" "}
                <span>Conversation stays on your machine in this example.</span>
              </p>
            </article>
          </>
        )}
        {session.mode === "receipt" && (
          <>
            <article className="message user-message">
              <div className="message-label">
                You <time>11:08</time>
              </div>
              <p>Save a reminder to check the server backup on Sunday.</p>
            </article>
            <article className="message assistant-message">
              <div className="message-label">
                <Mark small />
                {profile.companion}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>The reminder was saved. My reply didn’t arrive.</h3>
                  </CardTitle>
                  <CardDescription>
                    The tool receipt confirms the action. Only the answer is
                    missing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="stack">
                  <Status
                    evidence={{
                      state: "degraded",
                      detail:
                        "acted_no_reply · reminder.create completed; model timed out.",
                    }}
                  />
                  <details>
                    <summary>Tool arguments & receipt</summary>
                    <pre>{JSON.stringify(reminderReceiptFixture, null, 2)}</pre>
                  </details>
                  {replied ? (
                    <p role="status">
                      Your reminder is saved for Sunday at 17:00. This fixture
                      reply did not invoke the tool again.
                    </p>
                  ) : (
                    <Button variant="outline" onClick={() => setReplied(true)}>
                      Ask only for the reply
                    </Button>
                  )}
                </CardContent>
              </Card>
              <p className="model-note">
                Local model · reply unavailable · cost unknown
              </p>
            </article>
          </>
        )}
        {session.mode === "quiet" && !sourceMessageFixtures[session.id] && (
          <div className="quiet-chat">
            <Mark />
            <h2>What would you like to make room for?</h2>
            <p>Start anywhere. It doesn’t have to be a well-formed thought.</p>
            <Status evidence={{ state: "empty", detail: "A fresh thread." }} />
          </div>
        )}
        {messages.map((message, i) => (
          <article
            className={`message ${message.role === "user" ? "user-message" : "assistant-message"}`}
            key={i}
          >
            <div className="message-label">
              {message.role === "user" ? "You" : "Conker · scripted preview"}
            </div>
            <p>{message.text}</p>
          </article>
        ))}
        {stream > 0 && (
          <article className="message assistant-message">
            <div className="message-label">
              <Mark small />
              {profile.companion} · scripted preview
            </div>
            <p>
              {demoReply.slice(0, stream)}
              {streaming && (
                <span className="stream-cursor" aria-hidden="true" />
              )}
            </p>
          </article>
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-wrap">
        <form onSubmit={send} className="composer">
          <label className="sr-only" htmlFor="message">
            Message Conker
          </label>
          <textarea
            id="message"
            value={draft}
            maxLength={16000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What’s on your mind?"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e);
              }
            }}
          />
          <div className="composer-bottom">
            <span>
              <Badge variant="secondary">Local preview</Badge>
              <span className="keyboard-hint">
                Enter to send · Shift + Enter for a new line
              </span>
            </span>
            {streaming ? (
              <Button
                type="button"
                size="icon"
                aria-label="Stop reply"
                onClick={() => setStreaming(false)}
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={!draft.trim()}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>
        <p className="composer-note">
          A working sketch of Conker. Nothing here contacts a model or takes an
          action.
        </p>
      </div>
    </div>
  );
}
