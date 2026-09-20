/** Explicit build selection. Production never silently falls back to fixture data. */
export function resolveRuntimeMode(value: unknown, development: boolean): "fixture" | "gateway" | "invalid" {
  if (value === undefined || value === "") return development ? "fixture" : "gateway"
  return value === "fixture" || value === "gateway" ? value : "invalid"
}

export const runtimeMode = resolveRuntimeMode(import.meta.env.VITE_CONKER_MODE, import.meta.env.DEV)
