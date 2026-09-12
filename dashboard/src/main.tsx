import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ThemeProvider, TooltipProvider } from "./ui";
import { PreviewProvider, usePreview } from "./state";
import { Shell } from "./components/shell";
import { NotFound } from "./components/common";
import { Chat } from "./pages/chat";
import { InboxPage } from "./pages/inbox";
import { SystemPage } from "./pages/system";
import { AgentsPage } from "./pages/agents";
import { ToolsPage } from "./pages/tools";
import { MemoryPage } from "./pages/memory";
import { JournalPage } from "./pages/journal";
import { JobsPage } from "./pages/jobs";
import { SetupPage } from "./pages/setup";
import "./styles.css";

function RecentChat() {
  const { sessions } = usePreview();
  return <Navigate to={`/chat/${sessions[0].id}`} replace />;
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <TooltipProvider>
      <PreviewProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<RecentChat />} />
              <Route path="chat" element={<RecentChat />} />
              <Route path="chat/:sessionId" element={<Chat />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="inbox/:id" element={<InboxPage />} />
              <Route path="system" element={<SystemPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="agents/:id" element={<AgentsPage />} />
              <Route path="tools" element={<ToolsPage />} />
              <Route path="tools/:id" element={<ToolsPage />} />
              <Route path="memory" element={<MemoryPage />} />
              <Route path="memory/:id" element={<MemoryPage />} />
              <Route path="journal" element={<JournalPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="jobs/:id" element={<JobsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="setup" element={<SetupPage />} />
          </Routes>
        </BrowserRouter>
      </PreviewProvider>
    </TooltipProvider>
  </ThemeProvider>,
);
