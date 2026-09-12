import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./client";

export const keys = {
  object: (resource: string, id: string) => [resource, id] as const,
  list: (resource: string) => [resource, "list"] as const,
  messages: (sessionId: string) => ["messages", sessionId] as const,
};
export const queryClient = new QueryClient({ defaultOptions: { queries: {
  staleTime: 30_000, gcTime: 60 * 60_000, refetchOnWindowFocus: false,
  retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
}, mutations: { retry: false } } });
export function useObject<T>(resource: string, id: string) {
  return useQuery<T>({ queryKey: keys.object(resource, id), queryFn: () => api(`/${resource}/${encodeURIComponent(id)}`), enabled: !!id });
}
export function useList<T>(resource: string) {
  return useQuery<T[]>({ queryKey: keys.list(resource), queryFn: () => api(`/${resource}`) });
}
export async function refresh(...resources: string[]) {
  await Promise.all(resources.map(resource => queryClient.invalidateQueries({ queryKey: [resource] })));
}
