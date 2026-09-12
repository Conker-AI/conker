import type { Message, Run, Scenario, StreamEvent } from "../domain/model";
import { api, request } from "./client";
import { keys, queryClient, refresh } from "./queries";

// Application-owned subscriptions survive conversation unmounts. Each event cursor is per run.
export class RunCoordinator {
  private subscriptions = new Map<string, AbortController>();
  private cursors = new Map<string, number>();
  async submit(sessionId: string, text: string, replyTo: string | undefined, scenario: Scenario) {
    const id = crypto.randomUUID();
    const sending: Message = { id, sessionId, text, replyTo, author: "You", role: "user", createdAt: "Now", delivery: "sending" };
    queryClient.setQueryData<Message[]>(keys.messages(sessionId), old => [...(old ?? []), sending]);
    try {
      const run = await api<Run>("/submissions", { id, sessionId, text, replyTo, scenario });
      await this.accept(run);
    } catch {
      queryClient.setQueryData<Message[]>(keys.messages(sessionId), old => old?.map(message => message.id === id ? { ...message, delivery: "unknown" } : message));
    }
  }
  async resolveSubmission(id: string) { await this.accept(await api<Run>(`/submissions/${id}`)); }
  private async accept(run: Run) {
    const snapshot = await api<{ run: Run; messages: Message[] }>(`/runs/${run.id}/snapshot`);
    queryClient.setQueryData(keys.object("runs", run.id), snapshot.run);
    queryClient.setQueryData<Message[]>(keys.messages(run.sessionId), old => snapshot.messages.map(message => {
      const current = old?.find(item => item.id === message.id);
      return current && (current.streamCursor ?? 0) > (message.streamCursor ?? 0) ? current : message;
    }));
    this.cursors.set(run.id, snapshot.run.cursor);
    void this.subscribe(run.id);
    void refresh("journal");
  }
  async recover(id: string) { await this.accept(await api<Run>(`/runs/${id}`)); }
  async stop(id: string) {
    const run = await api<Run>(`/runs/${id}/stop`, {});
    this.subscriptions.get(id)?.abort();
    this.subscriptions.delete(id);
    queryClient.setQueryData(keys.object("runs", id), run);
    queryClient.setQueryData(keys.messages(run.sessionId), await api(`/messages/${run.sessionId}`));
  }
  private apply(event: StreamEvent) {
    if (event.id <= (this.cursors.get(event.runId) ?? 0)) return;
    this.cursors.set(event.runId, event.id);
    const run = queryClient.getQueryData<Run>(keys.object("runs", event.runId)); if (!run) return;
    queryClient.setQueryData<Run>(keys.object("runs", event.runId), { ...run, cursor: event.id, status: event.type === "complete" ? "completed" : "streaming" });
    if (event.type === "delta") queryClient.setQueryData<Message[]>(keys.messages(run.sessionId), old => old?.map(message => message.id === run.messageId && event.id > (message.streamCursor ?? 0) ? { ...message, text: message.text + (event.text ?? ""), streamCursor: event.id } : message));
  }
  private async subscribe(id: string) {
    if (this.subscriptions.has(id)) return;
    const controller = new AbortController(); this.subscriptions.set(id, controller);
    try {
      const response = await request(`/runs/${id}/events?after=${this.cursors.get(id) ?? 0}`, { signal: controller.signal });
      if (!response.body) throw new Error("Stream body is missing.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop()!;
        for (const frame of frames) {
          const data = frame.split("\n").find(line => line.startsWith("data: "));
          if (data) this.apply(JSON.parse(data.slice(6)) as StreamEvent);
        }
      }
    } catch { /* A missing stream receipt is preserved below, never inferred as stopped. */ }
    finally {
      this.subscriptions.delete(id);
      const run = queryClient.getQueryData<Run>(keys.object("runs", id));
      if (!controller.signal.aborted && run && run.status !== "completed" && run.status !== "stopped") queryClient.setQueryData(keys.object("runs", id), { ...run, status: "interrupted" });
    }
  }
  dispose() { this.subscriptions.forEach(controller => controller.abort()); this.subscriptions.clear(); }
}
export const runs = new RunCoordinator();
