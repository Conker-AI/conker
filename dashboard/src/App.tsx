import { ThemeRuntime } from "@/components/theme-customizer/runtime"
import { DataProvider } from "@/lib/api/provider"
import { BrowserRouter as Router } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { SidebarConfigProvider } from '@/contexts/sidebar-context'
import { AppRouter } from '@/components/router/app-router'
import { lazy, Suspense, useEffect } from 'react'
import { initGTM } from '@/utils/analytics'

// Get basename from environment (for deployment) or use empty string for development
const basename = import.meta.env.VITE_BASENAME || ''
const CallHost = lazy(() => import('@/components/call/call-host'))

function App() {
  // Initialize GTM on app load
  useEffect(() => {
    initGTM();
  }, []);

  return (
    <div className="font-sans antialiased" style={{ fontFamily: 'var(--font-inter)' }}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <SidebarConfigProvider>
          <ThemeRuntime />
          <Router basename={basename}>
            <DataProvider><AppRouter /><Suspense fallback={null}><CallHost /></Suspense></DataProvider>
          </Router>
        </SidebarConfigProvider>
      </ThemeProvider>
    </div>
  )
}

export default App
