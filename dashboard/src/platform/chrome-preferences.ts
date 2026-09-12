import { useSyncExternalStore } from "react";

type Preference = "navHidden" | "contactsHidden";
const key = "conker.conversation-chrome";
const defaults = {
  navHidden: false,
  contactsHidden:
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 760px)").matches,
};
let preferences = defaults;
try {
  const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
  preferences = {
    navHidden: saved.navHidden === true,
    contactsHidden:
      typeof saved.contactsHidden === "boolean"
        ? saved.contactsHidden
        : defaults.contactsHidden,
  };
} catch {
  /* Storage is optional. */
}
const listeners = new Set<() => void>();
export function useChromePreference(
  name: Preference,
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => preferences[name],
  );
  return [
    value,
    (next) => {
      preferences = { ...preferences, [name]: next };
      try {
        localStorage.setItem(key, JSON.stringify(preferences));
      } catch {
        /* In-memory choice still works. */
      }
      listeners.forEach((listener) => listener());
    },
  ];
}
