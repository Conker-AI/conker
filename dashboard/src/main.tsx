import { createRoot } from "react-dom/client";
import { BrowserRouter, useRoutes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, TooltipProvider } from "./ui";
import { PreviewProvider } from "./state";
import { Shell } from "./components/shell";
import { NotFound } from "./components/common";
import { features } from "./app/features";
import { createRegistry, RegistryContext } from "./platform/contributions";
import { queryClient } from "./data/queries";
import { runs } from "./data/runs";
import { startMocks } from "./mocks/browser";
import "./styles.css";
import "./app/reshape.css";

const registry = createRegistry(features);
function AppRoutes() {
  return useRoutes([{ element: <Shell />, children: [...registry.routes.filter(route => !route.outsideShell).map(route => ({ path: route.path, element: <route.Component /> })), { path: "*", element: <NotFound /> }] }, ...registry.routes.filter(route => route.outsideShell).map(route => ({ path: route.path, element: <route.Component /> }))]);
}
const root = createRoot(document.getElementById("root")!);
startMocks().then(stopMocks => {
  root.render(<QueryClientProvider client={queryClient}><RegistryContext value={registry}><ThemeProvider initialTheme="dark"><TooltipProvider><PreviewProvider><BrowserRouter><AppRoutes /></BrowserRouter></PreviewProvider></TooltipProvider></ThemeProvider></RegistryContext></QueryClientProvider>);
  if (import.meta.hot) import.meta.hot.dispose(() => { runs.dispose(); stopMocks(); root.unmount(); });
}).catch(error => {
  root.render(<ThemeProvider><div className="setup-layout"><h1>The fixture connection could not start.</h1><p>{String(error)}</p><p>Open this preview on localhost with service workers enabled, then reload. No real backend was used.</p></div></ThemeProvider>);
});
