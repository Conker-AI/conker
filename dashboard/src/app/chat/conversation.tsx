import { Link, useLocation } from "react-router-dom"
import { ArrowUp, ArrowUpRight, Info, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ToolActivity } from "@/components/tool-activity"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useConker, useConkerStore } from "@/lib/api/store"
import type { Session } from "@/lib/api/models"

function UserMessage({
  children,
  id,
}: {
  children: React.ReactNode
  id?: string
}) {
  return (
    <article
      id={id}
      className="ml-auto max-w-[92%] scroll-mt-6 rounded-xl rounded-tr-sm border bg-muted/40 px-4 py-3 sm:max-w-[85%]"
    >
      <span className="sr-only">You said: </span>
      <p className="whitespace-pre-wrap break-words text-sm leading-7">
        {children}
      </p>
    </article>
  )
}
export function Conversation({ session }: { session: Session }) {
  const plan = useConker(data => data.plan)
  const planningIntent = useConker(data => data.planningIntent)
  const { hash } = useLocation()
  const messages = useConker(data => data.messages)
  const { drafts, setDraft, send } = useConkerStore()
  const name = useConker((state) => state.profile.name)
  const portrait = useConker((state) => state.profile.portrait)
  const [replyRequested, setReplyRequested] = useState(false)
  const draft = drafts[session.id] || ""
  const localMessages = messages[session.id] || []
  const companion = session.agent === "Conker"
  const planning = session.mode === "plan"
  const receipt = session.mode === "receipt"
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <CompanionPortrait
          name={companion ? name : "Workshop"}
          portrait={companion ? portrait : undefined}
        />
        <div className="flex-1">
          <p className="text-sm font-medium">{companion ? name : "Workshop"}</p>
          <p className="text-xs text-muted-foreground">
            {companion ? "A little space to think." : "A second pair of hands."}
          </p>
        </div>
        {companion && (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/companion">
              Character Studio
              <ArrowUpRight />
            </Link>
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <p className="text-xs text-muted-foreground">
          12 September · fixture conversation
        </p>
        <Separator className="flex-1" />
      </div>
      <div className="flex flex-col gap-5" aria-label="Conversation thread">
        {receipt && (
          <UserMessage id="server-spec">
            Conker runs on my 16 GB server. No GPU. Text and a browser are
            enough for now.
          </UserMessage>
        )}
        {session.mode === "quiet" && (
          <UserMessage id="morning-preference">
            <span lang="ru">Я предпочитаю тренироваться перед школой.</span>
          </UserMessage>
        )}
        <UserMessage id="intent">
          {planning
            ? planningIntent
            : receipt
              ? "Remind me to check the server backup on Sunday at 17:00."
              : session.mode === "reading"
                ? "Summarise the reading notes in my Downloads folder."
                : session.mode === "project"
                  ? "I want the dashboard to feel calm, but I still need to find a session quickly. Keep it small enough to run on my server."
                  : "That was before term started. Judo is Tuesday and Thursday at 18:30 now. Keep Wednesday evening free."}
        </UserMessage>
        <div className="flex flex-col gap-4 sm:pr-8">
          {(planning || receipt) && <ToolActivity reminder={receipt} />}
          {receipt ? (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>Acted, no reply</AlertTitle>
              <AlertDescription>
                The reminder was saved in the fixture, but the model reply timed
                out. The receipt above is the evidence. Asking for a reply must
                not repeat the action.
              </AlertDescription>
              <div className="col-start-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={replyRequested}
                  onClick={() => setReplyRequested(true)}
                >
                  {replyRequested
                    ? "Reply request recorded"
                    : "Request reply only"}
                </Button>
                {replyRequested && (
                  <p
                    role="status"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    Local preview only. No model is connected; the action
                    receipt is unchanged.
                  </p>
                )}
              </div>
            </Alert>
          ) : (
            <article className="flex flex-col gap-3">
              <header className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  {companion ? name : "Workshop"}
                </span>
                <Badge variant="outline" className="font-normal">
                  {planning
                    ? "Encouraging"
                    : session.mode === "reading"
                      ? "Cautious"
                      : "Thoughtful"}
                </Badge>
              </header>
              <p className="text-sm leading-7">
                {planning
                  ? "You’ve got room. I’d keep tomorrow for the exam, and leave training days light. Wednesday can stay yours."
                  : session.mode === "reading"
                    ? "The reading pass found 47 PDFs. A deletion request was raised, but deleting your notes doesn’t match what you asked. The files are still in place; the summary is not ready."
                    : session.mode === "project"
                      ? "Let’s make the session list easy to scan: a title, an agent, and when you last talked. Save the breathing room for the conversation. We can build one useful screen at a time."
                      : "Got it. I’ll use the evening schedule for this plan. Your earlier morning preference remains an older source, not a rule to apply over what you just said."}
              </p>
              {planning && (
                <div className="divide-y rounded-lg border">
                  {plan.map((line) => (
                    <div
                      key={line.day}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="w-16 shrink-0 text-center">
                        <p className="text-[10px] tracking-wide text-muted-foreground">
                          {line.day}
                        </p>
                        {line.date && (
                          <p className="mt-0.5 text-lg font-medium tabular-nums">
                            {line.date}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{line.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {line.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {planning && (
                <p className="text-xs text-muted-foreground">
                  A suggested plan. Your calendar hasn’t changed.
                </p>
              )}
              {(planning || session.mode === "reading") && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="self-start"
                >
                  <Link to={planning ? "/inbox/coach" : "/inbox/cleanup"}>
                    {planning
                      ? "Review the email to coach"
                      : "Review the deletion request"}
                    <ArrowUpRight />
                  </Link>
                </Button>
              )}
              {session.mode === "quiet" && (
                <Link
                  className="text-xs text-muted-foreground underline underline-offset-4"
                  to="/chat/week"
                >
                  Parent conversation · Make room for the week
                </Link>
              )}
            </article>
          )}
        </div>
        {planning && (
          <details
            open={["#sent-user", "#expired-user"].includes(hash) || undefined}
            className="text-xs text-muted-foreground"
          >
            <summary className="cursor-pointer">
              Earlier source messages
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p id="sent-user">
                You: “Reply to Mum about Sunday.” · Yesterday
              </p>
              <p id="expired-user">
                You: “Check where my exam is.” · Yesterday
              </p>
            </div>
          </details>
        )}
        {localMessages.map((message) => (
          <div key={message.id} className="flex flex-col gap-3">
            <UserMessage>{message.text}</UserMessage>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              Saved in this preview. No model or tools are connected.
            </p>
          </div>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          send(session.id)
        }}
      >
        <Label htmlFor="message-composer" className="sr-only">
          Message {companion ? name : "Workshop"}
        </Label>
        <Textarea
          id="message-composer"
          placeholder={`Message ${companion ? name : "Workshop"}…`}
          value={draft}
          maxLength={4000}
          onChange={(event) => setDraft(session.id, event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              send(session.id)
            }
          }}
          className="min-h-24 resize-y"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Fixture only · Enter to send · Shift + Enter for a new line
          </p>
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim()}
            aria-label="Send message"
            className={cn("shrink-0")}
          >
            <ArrowUp />
          </Button>
        </div>
        <span className="sr-only" role="status">
          {localMessages.length
            ? `${localMessages.length} local messages saved. No model is connected.`
            : ""}
        </span>
      </form>
    </div>
  )
}
