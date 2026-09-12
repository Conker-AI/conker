import { createContext, useContext, useState, type ReactNode } from "react";
const Context = createContext<{ signedOut: boolean; signOut: () => void; signIn: () => void } | null>(null);
// Only tab-local interface state belongs here. Resource state lives in the query cache.
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [signedOut, setSignedOut] = useState(false);
  return <Context value={{ signedOut, signOut: () => setSignedOut(true), signIn: () => setSignedOut(false) }}>{children}</Context>;
}
export function usePreview() { const context = useContext(Context); if (!context) throw new Error("Preview provider is missing."); return context; }
