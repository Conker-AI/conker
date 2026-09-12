import { createContext, useContext, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Message } from "../domain/model";

export type Selection = { kind: "none" } | { kind: "session"; sessionId: string } | { kind: "message"; sessionId: string; message: Message } | { kind: "object"; resource: string; id: string };
export type CommandContext = { selection: Selection; navigate: (to: string) => void };
export type Command = { id: string; label: string; icon: LucideIcon; capability?: string; available: (context: CommandContext) => boolean | string; handler: (context: CommandContext) => void | Promise<void> };
export type SlotName = "message.actions" | "message.annotations" | "composer.tools" | "conversation.header" | "inspector.tabs" | "nav.groups";
export type Placement = { slot: SlotName; commandId: string; order?: number };
export type ViewContribution = { id: string; slot: "message.annotations" | "composer.tools" | "inspector.tabs"; label: string; capability?: string; applies: (context: CommandContext) => boolean; Component: ComponentType<{ context: CommandContext }> };
export type RouteContribution = { id: string; path: string; Component: ComponentType; outsideShell?: boolean };
export type NavigationContribution = { id: string; routeId: string; label: string; to: string; icon: LucideIcon; group: "Daily loop" | "Reference" | "Control" };
export type Feature = { id: string; shipped: boolean; commands?: Command[]; placements?: Placement[]; views?: ViewContribution[]; routes?: RouteContribution[]; navigation?: NavigationContribution[] };
export type Registry = ReturnType<typeof createRegistry>;

export function createRegistry(features: Feature[]) {
  const active = features.filter(feature => feature.shipped);
  const commands = active.flatMap(feature => feature.commands ?? []);
  const placements = active.flatMap(feature => feature.placements ?? []);
  const views = active.flatMap(feature => feature.views ?? []);
  const routes = active.flatMap(feature => feature.routes ?? []);
  const navigation = active.flatMap(feature => feature.navigation ?? []);
  for (const [kind, items] of [["feature", features], ["command", commands], ["view", views], ["route", routes], ["navigation", navigation]] as const) {
    const ids = items.map(item => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${kind} contribution ID.`);
  }
  for (const placement of placements) if (!commands.some(command => command.id === placement.commandId)) throw new Error(`Unknown command ${placement.commandId}.`);
  for (const item of navigation) if (!routes.some(route => route.id === item.routeId)) throw new Error(`Unknown route ${item.routeId}.`);
  return { commands, placements, views, routes, navigation, features: features.map(({ id, shipped }) => ({ id, shipped })) };
}
export const RegistryContext = createContext<Registry | null>(null);
export function useRegistry() { const registry = useContext(RegistryContext); if (!registry) throw new Error("Feature composition is missing."); return registry; }
