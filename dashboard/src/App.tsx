import { ThemeRuntime } from "@/components/theme-customizer/runtime"
import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarConfigProvider } from '@/contexts/sidebar-context'
import { lazy, Suspense, useEffect } from 'react'
import { initGTM } from '@/utils/analytics'
import { runtimeMode } from '@/lib/runtime-mode'

// Get basename from environment (for deployment) or use empty string for development
const basename = import.meta.env.VITE_BASENAME || ''
const FixtureWorkspace = lazy(() => import('@/components/fixture-workspace'))
const GatewayEntry = lazy(() => import('@/components/auth/gateway-entry'))
// Development only: the live workspace on an in-memory gateway (see src/dev/gateway-preview.tsx).
const GatewayPreview = import.meta.env.DEV ? lazy(() => import('@/dev/gateway-preview')) : null
function gatewayPreviewEnabled() {
  if (!import.meta.env.DEV) return false
  try {
    const flag = new URLSearchParams(window.location.search).get('gateway-preview')
    if (flag !== null) window.sessionStorage.setItem('conker-gateway-preview', flag)
    return window.sessionStorage.getItem('conker-gateway-preview') === '1'
  } catch { return false }
}

function App() {
  // Initialize GTM on app load
  useEffect(() => {
    initGTM();
  }, []);

  return (
    <div className="font-sans antialiased">
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <SidebarConfigProvider>
          <ThemeRuntime />
          <Router basename={basename}>
            <Suspense fallback={<main className="p-6" role="status">Opening Conker…</main>}>
              {GatewayPreview && gatewayPreviewEnabled() ? <GatewayPreview /> : runtimeMode === 'fixture' ? <FixtureWorkspace /> : runtimeMode === 'gateway' ? <GatewayEntry /> : <main className="p-6" role="alert">Invalid dashboard mode. Set VITE_CONKER_MODE to gateway or fixture and rebuild.</main>}
            </Suspense>
          </Router>
        </SidebarConfigProvider>
      </ThemeProvider>
    </div>
  )
}

export default App
