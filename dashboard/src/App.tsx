import { ThemeRuntime } from "@/components/theme-customizer/runtime"
import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarConfigProvider } from '@/contexts/sidebar-context'
import { lazy, Suspense, useEffect } from 'react'
import { initGTM } from '@/utils/analytics'
import { runtimeMode } from '@/lib/runtime-mode'
import { ToastProvider } from '@/components/ui/toast'
import { ErrorBoundary } from '@/components/resilience/error-boundary'
import { CrashScreen } from '@/components/resilience/error-fallbacks'
import { AppLoading } from '@/components/resilience/skeletons'

// Get basename from environment (for deployment) or use empty string for development
const basename = import.meta.env.VITE_BASENAME || ''
const GatewayEntry = lazy(() => import('@/components/auth/gateway-entry'))
// Development only: the live workspace on an in-memory gateway (see src/dev/gateway-preview.tsx).
const GatewayPreview = import.meta.env.DEV ? lazy(() => import('@/dev/gateway-preview')) : null
const FixtureWorkspace = import.meta.env.DEV ? lazy(() => import('@/components/fixture-workspace')) : null
const legacyFixtureShell = import.meta.env.DEV && import.meta.env.VITE_CONKER_FIXTURE_SHELL === 'legacy'

function App() {
  // Initialize GTM on app load
  useEffect(() => {
    initGTM();
  }, []);

  return (
    <div className="font-sans antialiased">
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <ToastProvider>
        <SidebarConfigProvider>
          <ThemeRuntime />
          <ErrorBoundary fallback={props => <CrashScreen {...props} />}>
          <Router basename={basename}>
            <Suspense fallback={<AppLoading />}>
              {runtimeMode === 'fixture' && GatewayPreview
                ? legacyFixtureShell && FixtureWorkspace ? <FixtureWorkspace /> : <GatewayPreview />
                : runtimeMode === 'gateway'
                  ? <GatewayEntry />
                  : <main className="p-6" role="alert">Invalid dashboard mode. Set VITE_CONKER_MODE to gateway or fixture and rebuild.</main>}
            </Suspense>
          </Router>
          </ErrorBoundary>
        </SidebarConfigProvider>
        </ToastProvider>
      </ThemeProvider>
    </div>
  )
}

export default App
