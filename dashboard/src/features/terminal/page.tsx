import { useState } from "react";
import { TerminalSquare, GitBranch, GitCommitHorizontal } from "lucide-react";
import { Button, Status } from "../../ui";
import { PageHeading } from "../../components/common";
import { DetailFields } from "../../components/object-inspector";

export function TerminalWorkspace() {
  const [attempted, setAttempted] = useState(false);
  return <div className="page terminal-page"><PageHeading eyebrow="Owner workspace" title="Terminal" description="Your server, when you need to work directly." /><div className="terminal-boundary"><Status evidence={{ state: "offline", detail: attempted ? "Preview only: no shell service or authenticated connection exists." : "Disconnected · mock terminal. Commands cannot run." }} /><p>A terminal is a separate owner-authenticated shell. SystemGate remains read-only observation; no agent has this workspace’s authority.</p></div><div className="terminal-surface"><header><TerminalSquare /><span>conker-home · Ubuntu</span><span>Not connected</span></header><div className="terminal-output"><p>This is where your shell will open.</p><p>No connection has been attempted. There is no command execution in this preview.</p><label className="terminal-prompt">$ <input aria-label="Terminal command (not connected)" placeholder="A separate authenticated shell is required" disabled /></label></div></div><Button variant="outline" onClick={() => setAttempted(true)}>Preview connection requirement</Button><section className="terminal-context"><h2>Project context</h2><DetailFields fields={[{ label: "Repository", value: "companion · fixture" }, { label: "Branch", value: <span><GitBranch />feat/dashboard</span> }, { label: "Working tree", value: "Dashboard changes awaiting review · fixture" }, { label: "Last commit", value: <span><GitCommitHorizontal />23ed8c6 · preview context</span> }]} /><p className="fine-print">Context only. No commit, push, merge, or bespoke Git client.</p></section></div>;
}
