import { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router";
import {
  MessageCircle,
  Inbox,
  BookOpen,
  History,
  Bot,
  Wrench,
  CalendarClock,
  Server,
  Menu,
  ChevronUp,
  LogOut,
  Palette,
} from "lucide-react";
import {
  Button,
  Badge,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  ThemeToggle,
} from "../ui";
import { usePreview } from "../state";
import { Popover } from "radix-ui";
import { inboxFixtures } from "../fixtures/inbox";
import { Mark } from "./common";

const groups = [
  {
    label: "Daily loop",
    items: [
      ["Chat", "/chat", MessageCircle],
      ["Inbox", "/inbox", Inbox],
    ],
  },
  {
    label: "Reference",
    items: [
      ["Memory", "/memory", BookOpen],
      ["Journal", "/journal", History],
    ],
  },
  {
    label: "Control",
    items: [
      ["Agents", "/agents", Bot],
      ["Tools", "/tools", Wrench],
      ["Jobs", "/jobs", CalendarClock],
      ["System", "/system", Server],
    ],
  },
] as const;
function Navigation({ close }: { close?: () => void }) {
  const { decisions, signOut, profile } = usePreview();
  const [menu, setMenu] = useState(false);
  const count = inboxFixtures.filter(
    (item) =>
      !decisions[item.id] &&
      (item.kind === "proposal" || item.lifecycle === "pending"),
  ).length;
  return (
    <div className="navigation">
      <Link className="wordmark" to="/" onClick={close}>
        <Mark small />
        Conker
      </Link>
      <nav aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map(([name, href, Icon]) => (
              <NavLink
                key={name}
                to={href}
                onClick={close}
                className={({ isActive }) =>
                  isActive ? "nav-item selected" : "nav-item"
                }
              >
                <Icon aria-hidden="true" />
                <span>{name}</span>
                {name === "Inbox" && (
                  <Badge
                    className="nav-count"
                    variant="secondary"
                    aria-label={`${count} decisions`}
                  >
                    {count}
                  </Badge>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <p className="sidebar-note">
          A little more room
          <br />
          for everything else.
        </p>
        <div className="owner-wrap">
          <Popover.Root open={menu} onOpenChange={setMenu}>
            <Popover.Trigger asChild>
              <Button
                variant="ghost"
                className="owner-button"
                aria-label="Owner menu"
              >
                <span className="avatar">
                  {profile.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="owner-text">
                  <strong>{profile.name}</strong>
                  <small>Your own space</small>
                </span>
                <ChevronUp aria-hidden="true" />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                align="start"
                sideOffset={8}
                className="owner-menu"
                aria-label="Owner preferences"
              >
                <p>
                  <Palette aria-hidden="true" />
                  Appearance
                </p>
                <ThemeToggle />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMenu(false);
                    signOut();
                    close?.();
                  }}
                >
                  <LogOut aria-hidden="true" />
                  Sign out of preview
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </div>
  );
}
export function Shell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const title = location.pathname.split("/")[1] || "chat";
  const { signedOut, signIn } = usePreview();
  if (signedOut)
    return (
      <div className="setup-layout">
        <Mark />
        <h1>You’re signed out of the preview.</h1>
        <p>
          No server session exists here. Your fixture changes are only in this
          tab.
        </p>
        <Button onClick={signIn}>Return to preview</Button>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Navigation />
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="topbar-left">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetHeader className="sr-only">
                  <SheetTitle>Conker navigation</SheetTitle>
                  <SheetDescription>
                    Daily loop, reference and control.
                  </SheetDescription>
                </SheetHeader>
                <Navigation close={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="crumb">
              Your space <span>/</span>{" "}
              <strong>{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
            </span>
          </div>
          <Badge variant="outline">Interactive preview · fixture data</Badge>
        </div>
        <main id="main" key={location.pathname.split("/")[1]}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
