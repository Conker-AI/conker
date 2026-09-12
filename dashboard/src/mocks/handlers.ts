import { http, HttpResponse, delay } from "msw";
import { db, log } from "./database";
import type {
  Message,
  Run,
  Scenario,
  StreamEvent,
  CharacterProfile,
} from "../domain/model";

const base = "/__fixture/v1";
const headers = { "x-conker-fixture": "true" };
const json = (value: unknown, status = 200) =>
  HttpResponse.json(value, { status, headers });
const problem = (message: string, status: number) => json({ message }, status);
const events = new Map<string, StreamEvent[]>();
const scenarios = new Map<string, Scenario>();
const interrupted = new Set<string>();
const reply =
  "Let’s leave a little room. One useful step is enough for now. I’d start with the part you can finish before dinner, then leave the rest for tomorrow. Это предложение, не правило — решать тебе. This reply is a local fixture; no model was called.";
function generate(run: Run) {
  const tick = () => {
    if (run.status === "stopped") return;
    const output = db.messages[run.messageId];
    const next = reply.slice(output.text.length, output.text.length + 9);
    output.text += next;
    run.cursor += 1;
    output.streamCursor = run.cursor;
    run.status = next ? "streaming" : "completed";
    events
      .get(run.id)!
      .push({
        id: run.cursor,
        runId: run.id,
        type: next ? "delta" : "complete",
        text: next,
      });
    if (next) setTimeout(tick, 110);
  };
  setTimeout(tick, 120);
}
export const handlers = [
  http.post(`${base}/submissions`, async ({ request }) => {
    const input = (await request.json()) as {
      id: string;
      sessionId: string;
      text: string;
      replyTo?: string;
      scenario: Scenario;
    };
    const previous = db.submissions[input.id];
    if (previous) return json(db.runs[previous]);
    const session = db.sessions[input.sessionId];
    if (!session || !input.text.trim() || input.text.length > 16000)
      return problem(
        "Choose a session and a message of 1–16,000 characters.",
        422,
      );
    const id = `run-${input.id}`;
    const userMessage: Message = {
      id: input.id,
      sessionId: session.id,
      author: "You",
      role: "user",
      text: input.text,
      replyTo: input.replyTo,
      delivery: "accepted",
      createdAt: "Now",
    };
    const run: Run = {
      id,
      sessionId: session.id,
      submissionId: input.id,
      messageId: `reply-${input.id}`,
      status: "accepted",
      cursor: 0,
      model: "Local · Qwen 2.5 3B",
      costUsd: null,
      policy: structuredClone(session.policy),
      participantSnapshot: {
        agentIds: [...session.participantIds],
        ...(session.contactId === "study"
          ? { groupRevision: db.groups["study-group"].revision }
          : {}),
      },
      delegations: [],
    };
    db.submissions[input.id] = id;
    db.messages[userMessage.id] = userMessage;
    db.messages[run.messageId] = {
      id: run.messageId,
      sessionId: session.id,
      author:
        session.contactId === "workshop"
          ? "Workshop"
          : db.character.companion.name,
      role: "assistant",
      text: "",
      createdAt: "Now",
      delivery: "accepted",
      runId: id,
      emotion: "thoughtful",
    };
    db.runs[id] = run;
    events.set(id, []);
    scenarios.set(id, input.scenario);
    generate(run);
    log(
      "Accepted a conversation message",
      "Turn",
      `/chat/${session.id}#${input.id}`,
    );
    await delay(650);
    if (input.scenario === "lost-ack")
      return problem(
        "Acceptance response was lost. Check this submission’s existing ID.",
        503,
      );
    return json(run);
  }),
  http.get(`${base}/submissions/:id`, ({ params }) => {
    const id = db.submissions[String(params.id)];
    return id
      ? json(db.runs[id])
      : problem(
          "Submission is not known. No automatic second submission was made.",
          404,
        );
  }),
  http.get(`${base}/runs/:id/snapshot`, ({ params }) => {
    const run = db.runs[String(params.id)];
    if (!run) return problem("Run not found.", 404);
    return json({
      run,
      messages: Object.values(db.messages).filter(
        (message) => message.sessionId === run.sessionId,
      ),
    });
  }),
  http.get(`${base}/runs/:id/events`, ({ params, request }) => {
    const id = String(params.id);
    const run = db.runs[id];
    if (!run)
      return problem("Run not found. Open the session’s retained record.", 404);
    let cursor = Number(new URL(request.url).searchParams.get("after") ?? 0);
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: StreamEvent) =>
          controller.enqueue(
            new TextEncoder().encode(
              `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        while (!cancelled) {
          for (const event of events.get(id) ?? []) {
            if (event.id <= cursor) continue;
            send(event);
            cursor = event.id;
            if (scenarios.get(id) === "duplicate") send(event);
            if (
              scenarios.get(id) === "interrupted" &&
              cursor >= 4 &&
              !interrupted.has(id)
            ) {
              interrupted.add(id);
              controller.close();
              return;
            }
          }
          if (run.status === "completed" || run.status === "stopped") {
            controller.close();
            return;
          }
          await delay(60);
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return new HttpResponse(stream, {
      headers: { ...headers, "Content-Type": "text/event-stream" },
    });
  }),
  http.post(`${base}/runs/:id/stop`, ({ params }) => {
    const run = db.runs[String(params.id)];
    if (!run) return problem("Run not found.", 404);
    if (run.status !== "completed") run.status = "stopped";
    return json(run);
  }),
  http.get(`${base}/messages/:sessionId`, ({ params }) =>
    json(
      Object.values(db.messages).filter(
        (message) => message.sessionId === params.sessionId,
      ),
    ),
  ),
  http.post(`${base}/sessions`, async ({ request }) => {
    const input = (await request.json()) as {
      id: string;
      contactId: string;
      parentId?: string;
      parentMessageId?: string;
    };
    const contact = db.contacts[input.contactId];
    if (!contact) return problem("Contact not found.", 404);
    if (db.sessions[input.id]) return json(db.sessions[input.id]);
    const previous = db.sessions[input.parentId ?? contact.sessionIds[0]];
    const next = {
      ...structuredClone(previous),
      id: input.id,
      title: input.parentId
        ? `A branch of ${previous.title}`
        : "A fresh conversation",
      parentId: input.parentId,
      parentMessageId: input.parentMessageId,
      summary: input.parentId
        ? "Untrusted model summary: keep the useful context, and leave room to change direction."
        : undefined,
      updatedAt: new Date().toISOString(),
    };
    db.sessions[input.id] = next;
    contact.sessionIds.unshift(input.id);
    log(
      input.parentId ? "Forked a conversation" : "Opened a new conversation",
      input.parentId ? "Fork" : "Turn",
      `/chat/${input.id}`,
    );
    return json(next);
  }),
  http.post(`${base}/approvals/:id/decision`, async ({ params, request }) => {
    const input = (await request.json()) as {
      decision: "approved" | "denied";
      revision: number;
      reason?: string;
      scenario?: string;
    };
    const approval = db.approvals[String(params.id)];
    if (!approval) return problem("Approval not found.", 404);
    await delay(700);
    if (input.scenario === "expired") {
      approval.decision = "expired";
      db.actions[approval.actionId].status = "expired";
    }
    if (input.scenario === "revision") approval.revision += 1;
    if (approval.decision !== "pending" || approval.revision !== input.revision)
      return problem(
        "Authority expired or the request changed. Read the current record; nothing was approved by this attempt.",
        409,
      );
    approval.decision = input.decision;
    approval.denialReason = input.reason;
    approval.revision += 1;
    const action = db.actions[approval.actionId];
    action.status = input.decision === "denied" ? "denied" : "in_progress";
    log(
      `${input.decision === "approved" ? "Approved" : "Denied"} ${approval.tool}${input.reason ? ` · ${input.reason}` : ""}`,
      "Decision",
      `/inbox/${approval.id}`,
      action.id,
    );
    if (input.decision === "approved")
      setTimeout(() => {
        action.status =
          input.scenario === "unknown" ? "outcome_unknown" : "completed";
        if (action.status === "completed")
          action.receipt =
            "Stateful fixture receipt: the sample action completed. No real effect.";
      }, 1400);
    return json(approval);
  }),
  http.post(`${base}/actions/:id/check`, ({ params }) =>
    json(db.actions[String(params.id)]),
  ),
  http.post(`${base}/actions/:id/reply`, ({ params }) => {
    const action = db.actions[String(params.id)];
    if (!action?.replyMissing || action.status !== "completed")
      return problem("No confirmed action is missing a reply.", 409);
    action.replyMissing = false;
    const id = `recovered-${action.id}`;
    db.messages[id] = {
      id,
      sessionId: action.sessionId,
      author: "Conker",
      role: "assistant",
      text: "Your reminder is saved for Sunday at 17:00. This reply did not invoke the tool again.",
      delivery: "accepted",
      createdAt: "Now",
    };
    log(
      "Recovered only the missing reply",
      "Turn",
      `/chat/${action.sessionId}`,
      action.id,
    );
    return json(action);
  }),
  http.post(`${base}/citations/:id/delete`, ({ params }) => {
    const citation = db.citations[String(params.id)];
    if (!citation) return problem("Citation not found.", 404);
    citation.deleted = true;
    delete citation.excerpt;
    const message = db.messages[citation.messageId];
    message.text = "";
    message.deleted = true;
    log(
      "Forgot a cited message; tombstone retained",
      "Memory",
      `/chat/${message.sessionId}#${message.id}`,
    );
    return json(citation);
  }),
  http.post(`${base}/character/:id`, async ({ request }) => {
    const input = (await request.json()) as CharacterProfile;
    if (!input.name.trim() || input.name.length > 60)
      return problem("Use a name between 1 and 60 characters.", 422);
    db.character.companion = { ...input, id: "companion" };
    db.contacts.home.name = input.name;
    db.profile.owner.companion = input.name;
    return json(db.character.companion);
  }),
  http.post(`${base}/proposals/:id`, async ({ params, request }) => {
    const input = (await request.json()) as {
      decision: "accepted" | "declined";
    };
    const proposal = db.proposals[String(params.id)];
    proposal.decision = input.decision;
    log(
      `${input.decision} proposal: ${proposal.title}`,
      "Decision",
      `/inbox/${proposal.id}`,
    );
    return json(proposal);
  }),
  http.post(`${base}/memory/:id`, async ({ params, request }) => {
    const input = (await request.json()) as {
      correction?: string;
      forgotten?: boolean;
    };
    const memory = db.memory[String(params.id)];
    Object.assign(memory, input);
    if (memory.forgotten) {
      memory.text = "";
      memory.quote = "";
      memory.correction = "";
    }
    log(
      memory.forgotten
        ? "Forgot a fixture memory; tombstone retained"
        : "Corrected a fixture memory",
      "Memory",
      `/memory/${memory.id}`,
    );
    return json(memory);
  }),
  http.post(`${base}/jobs/:id`, async ({ params, request }) => {
    const input = (await request.json()) as { paused?: boolean; run?: boolean };
    const job = db.jobs[String(params.id)];
    if (input.run && job.paused)
      return problem("Resume the schedule before replaying this fixture.", 409);
    if (input.paused !== undefined) job.paused = input.paused;
    if (input.run) job.runs += 1;
    log(
      `${input.run ? "Replayed" : job.paused ? "Paused" : "Resumed"} ${job.name}`,
      "Job",
      `/jobs/${job.id}`,
    );
    return json(job);
  }),
  http.post(`${base}/agents/:id/grant`, async ({ params, request }) => {
    const input = (await request.json()) as { id: string; frequency: number };
    const agent = db.agents[String(params.id)];
    const grant = agent?.grants.find((g) => g.id === input.id);
    if (!grant || input.frequency < 1 || input.frequency > 100)
      return problem("Choose an existing grant and 1–100 uses.", 422);
    grant.frequency = input.frequency;
    log(
      `Changed ${grant.id} to ${input.frequency} uses in its existing period`,
      "Grant",
      `/agents/${agent.id}`,
    );
    return json(agent);
  }),
  http.post(`${base}/profile/owner`, async ({ request }) => {
    Object.assign(db.profile.owner, await request.json());
    return json(db.profile.owner);
  }),
  http.post(`${base}/capabilities/:id`, async ({ params, request }) => {
    const capability = db.capabilities[String(params.id)];
    if (!capability) return problem("Capability not found.", 404);
    Object.assign(capability, await request.json());
    return json(capability);
  }),
  http.get(`${base}/:resource/:id`, ({ params }) => {
    const collection = (
      db as unknown as Record<string, Record<string, unknown>>
    )[String(params.resource)];
    const object = collection?.[String(params.id)];
    return object
      ? json(object)
      : problem("Record not found. Return to its collection.", 404);
  }),
  http.get(`${base}/:resource`, ({ params, request }) => {
    if (new URL(request.url).searchParams.get("unavailable") === "true")
      return problem(
        "Dependency unavailable. Retained records have not been erased.",
        503,
      );
    const collection = (
      db as unknown as Record<string, Record<string, unknown>>
    )[String(params.resource)];
    return collection
      ? json(Object.values(collection))
      : problem("Fixture collection not found.", 404);
  }),
];
