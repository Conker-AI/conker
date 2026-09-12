export const API_PREFIX = "/__fixture/v1";
let mockReady = false;
export function markMockReady() { mockReady = true; }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// The preview has no real transport fallback, including in a production build.
export async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!mockReady) throw new Error("Fixture interception is not ready. Reload the preview.");
  if (!path.startsWith("/") || path.includes("..")) throw new Error("Invalid fixture resource path.");
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, credentials: "omit", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (response.headers.get("x-conker-fixture") !== "true") throw new Error("No fixture response received. No real service is configured.");
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ message: "Fixture response could not be read." }));
    throw new ApiError(response.status, problem.message ?? `Request refused (${response.status}).`);
  }
  return response;
}
export async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  return (await request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).json();
}
