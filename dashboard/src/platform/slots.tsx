import { useState } from "react";
import { useNavigate } from "react-router";
import { MoreHorizontal, Search } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, Status } from "../ui";
import type { Capability } from "../domain/model";
import { useList } from "../data/queries";
import { useRegistry, type CommandContext, type Selection, type SlotName, type Command } from "./contributions";
import { commandReason, capabilityReason } from "./capabilities";

export function useCommandContext(selection: Selection): CommandContext { return { selection, navigate: useNavigate() }; }
export function Slot({ name, selection }: { name: SlotName; selection: Selection }) {
  const registry = useRegistry(); const context = useCommandContext(selection);
  const { data: capabilities } = useList<Capability>("capabilities");
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(""); const [error, setError] = useState("");
  const commands = registry.placements.filter(p => p.slot === name).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => registry.commands.find(command => command.id === p.commandId)!);
  const views = registry.views.filter(view => view.slot === name && view.applies(context));
  const directLimit = name === "message.actions" ? 2 : name === "conversation.header" ? 1 : 0;
  async function execute(command: Command) {
    if (commandReason(command, context, capabilities)) return;
    setError("");
    try { await command.handler(context); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Command failed. Try opening its record."); }
  }
  return <div className={`contribution-slot slot-${name.replace(".", "-")}`} data-slot-name={name}>
    {commands.slice(0, directLimit).map(command => <Button key={command.id} variant="ghost" size="sm" title={commandReason(command, context, capabilities)} disabled={!!commandReason(command, context, capabilities)} onClick={() => void execute(command)}><command.icon />{command.label}</Button>)}
    {commands.length > directLimit && <Button variant="ghost" size="sm" aria-label={name === "composer.tools" ? "Composer tools" : "More actions"} onClick={() => setOpen(true)}><MoreHorizontal />{name === "composer.tools" && "Tools"}</Button>}
    {views.map(view => capabilityReason(capabilities, view.capability) ? null : <view.Component key={view.id} context={context} />)}
    {error && <Status evidence={{ state: "degraded", detail: error }} />}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{name === "composer.tools" ? "Conversation tools" : "Available actions"}</DialogTitle><DialogDescription>Registered features for this selection. Unavailable commands explain why.</DialogDescription></DialogHeader><Input aria-label="Search actions" placeholder="Search commands…" value={search} onChange={event => setSearch(event.target.value)} /><div className="command-list">{commands.filter(command => command.label.toLowerCase().includes(search.toLowerCase())).map(command => { const reason = commandReason(command, context, capabilities); return <div key={command.id}><Button variant="ghost" disabled={!!reason} onClick={() => void execute(command)}><command.icon />{command.label}</Button>{reason && <small>{reason}</small>}</div>; })}</div></DialogContent></Dialog>
  </div>;
}
export function CommandSearch({ selection }: { selection: Selection }) {
  const registry = useRegistry(); const context = useCommandContext(selection); const { data: capabilities } = useList<Capability>("capabilities");
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(""); const [error, setError] = useState("");
  return <><Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Search />Commands</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Command search</DialogTitle><DialogDescription>All shipped commands. Availability follows the current selection.</DialogDescription></DialogHeader><Input aria-label="Search all commands" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a command…" /><div className="command-list">{registry.commands.filter(c => c.label.toLowerCase().includes(search.toLowerCase())).map(command => { const reason = commandReason(command, context, capabilities); return <div key={command.id}><Button variant="ghost" disabled={!!reason} onClick={async () => { try { await command.handler(context); setOpen(false); } catch (cause) { setError(String(cause)); } }}><command.icon />{command.label}</Button><small>{reason ?? command.id}</small></div>; })}</div>{error && <p role="alert">{error}</p>}<details><summary>Feature diagnostics</summary>{registry.features.map(feature => <p className="fine-print" key={feature.id}>{feature.id} · {feature.shipped ? "shipped" : "not shipped"}</p>)}</details></DialogContent></Dialog></>;
}
