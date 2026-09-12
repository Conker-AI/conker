import { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router";
import { Menu, ChevronUp, LogOut, Palette } from "lucide-react";
import { Popover } from "radix-ui";
import { Button, Badge, Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, ThemeToggle } from "../ui";
import { usePreview } from "../state";
import { useRegistry } from "../platform/contributions";
import { useInbox } from "../data/inbox";
import { useObject } from "../data/queries";
import type { CharacterProfile } from "../domain/model";
import { Portrait } from "../features/character-studio/portrait";
import { companionPlacement } from "../app/config";

function Navigation({ close }: { close?: () => void }) {
  const registry = useRegistry(); const inbox = useInbox(); const { signOut } = usePreview(); const [menu, setMenu] = useState(false);
  const profile = useObject<{ name: string }>("profile", "owner"); const character = useObject<CharacterProfile>("character", "companion");
  return <div className="navigation"><div className="sidebar-brand"><Link className="wordmark" to="/" onClick={close}><span aria-hidden="true">🌱</span>Conker</Link>{companionPlacement === "title" && <Button variant="ghost" size="icon" asChild><Link to="/companion" aria-label="Companion settings" onClick={close}><Portrait profile={character.data} /></Link></Button>}</div>
    <nav aria-label="Main navigation" data-slot-name="nav.groups">{(["Daily loop", "Reference", "Control"] as const).map(group => <div className="nav-group" key={group}><p className="nav-label">{group}</p>{registry.navigation.filter(item => item.group === group).map(item => <NavLink key={item.id} to={item.to} end={item.to === "/"} onClick={close} className={({ isActive }) => isActive ? "nav-item selected" : "nav-item"}><item.icon aria-hidden="true" /><span>{item.label}</span>{item.routeId === "inbox" && <Badge variant="secondary" className="nav-count" aria-label={inbox.error ? "Inbox unavailable" : `${inbox.pending.length} decisions`}>{inbox.error ? "?" : inbox.pending.length}</Badge>}</NavLink>)}</div>)}</nav>
    <div className="sidebar-foot"><p className="sidebar-note">A little more room<br />for everything else.</p><div className="owner-wrap"><Popover.Root open={menu} onOpenChange={setMenu}><Popover.Trigger asChild><Button variant="ghost" className="owner-button" aria-label="Owner menu"><span className="avatar">{profile.data?.name.slice(0,2).toUpperCase() ?? "…"}</span><span className="owner-text"><strong>{profile.data?.name ?? "Your space"}</strong><small>On your own terms</small></span><ChevronUp /></Button></Popover.Trigger><Popover.Portal><Popover.Content side="top" align="start" sideOffset={8} className="owner-menu" aria-label="Owner preferences"><p><Palette />Appearance</p><ThemeToggle /><Button variant="ghost" asChild><Link to="/companion" onClick={() => { setMenu(false); close?.(); }}>Character Studio</Link></Button><Button variant="ghost" onClick={() => { signOut(); close?.(); }}><LogOut />Sign out of preview</Button></Popover.Content></Popover.Portal></Popover.Root></div></div>
  </div>;
}
export function Shell() {
  const [open, setOpen] = useState(false); const location = useLocation(); const { signedOut, signIn } = usePreview();
  const messenger = location.pathname === "/" || location.pathname.startsWith("/chat");
  if (signedOut) return <div className="setup-layout"><h1>You’re signed out of the preview.</h1><p>No authenticated session exists here. Fixture records remain in this tab.</p><Button onClick={signIn}>Return to preview</Button></div>;
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a><aside className="desktop-sidebar"><Navigation /></aside><div className="workspace"><div className="topbar"><div className="topbar-left"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="mobile-menu" aria-label="Open navigation"><Menu /></Button></SheetTrigger><SheetContent side="left" className="mobile-sidebar"><SheetHeader className="sr-only"><SheetTitle>Conker navigation</SheetTitle><SheetDescription>Your daily loop, reference and controls.</SheetDescription></SheetHeader><Navigation close={() => setOpen(false)} /></SheetContent></Sheet><span className="crumb">Your space <span>/</span> <strong>{messenger ? "Conversations" : location.pathname.split("/")[1]}</strong></span></div><Badge variant="outline">Fixture preview</Badge></div><main id="main" className={messenger ? "messenger-main" : "screen-main"}><Outlet /></main></div></div>;
}
