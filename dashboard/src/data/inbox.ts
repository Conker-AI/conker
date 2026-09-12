import { useQueries } from "@tanstack/react-query";
import type { Approval, InboxItem, ProposalRecord } from "../domain/model";
import { api } from "./client";
import { keys, useList } from "./queries";
export function useInbox() {
  const index = useList<InboxItem>("inbox");
  const objects = useQueries({ queries: (index.data ?? []).map(item => ({ queryKey: keys.object(item.kind === "approval" ? "approvals" : "proposals", item.resourceId), queryFn: () => api<Approval | ProposalRecord>(`/${item.kind === "approval" ? "approvals" : "proposals"}/${item.resourceId}`) })) });
  const records = objects.flatMap(query => query.data ? [query.data] : []);
  const pending = records.filter(item => item.kind === "approval" ? item.decision === "pending" : !item.decision);
  return { records, pending, isPending: index.isPending || objects.some(query => query.isPending), error: index.error ?? objects.find(query => query.error)?.error };
}
