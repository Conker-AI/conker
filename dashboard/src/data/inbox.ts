import { useQueries } from "@tanstack/react-query";
import type { Approval, InboxItem, ProposalRecord } from "../domain/model";
import { api } from "./client";
import { keys, useList } from "./queries";
import { adaptRecord } from "./adapters";
export function useInbox() {
  const index = useList<InboxItem>("inbox");
  const objects = useQueries({
    queries: (index.data ?? []).map((item) => {
      const resource = item.kind === "approval" ? "approvals" : "proposals";
      return {
        refetchInterval: 15_000,
        queryKey: keys.object(resource, item.resourceId),
        queryFn: async () =>
          adaptRecord(
            resource,
            await api(`/${resource}/${item.resourceId}`),
            item.resourceId,
          ) as Approval | ProposalRecord,
      };
    }),
  });
  const records = objects.flatMap((query) => (query.data ? [query.data] : []));
  const pending = records.filter((item) =>
    item.kind === "approval" ? item.decision === "pending" : !item.decision,
  );
  return {
    records,
    pending,
    isFetching: index.isFetching || objects.some((query) => query.isFetching),
    isPending: index.isPending || objects.some((query) => query.isPending),
    error: index.error ?? objects.find((query) => query.error)?.error,
  };
}
