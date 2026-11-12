import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { JWTAuthProvider } from './contexts/JWTAuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { getApiBaseUrl } from './lib/apiConfig'
import { notifyPwaUpdateAvailable, setPwaUpdateServiceWorker } from './lib/pwaUpdateState'
import './lib/utils'
import './index.css'

const API_URL = getApiBaseUrl()
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh: notifyPwaUpdateAvailable,
  onNeedReload: () => window.location.reload(),
  onRegisteredSW: (_serviceWorkerUrl, registration) => {
    if (!registration) return
    const checkForUpdates = () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => undefined)
    }
    window.setInterval(checkForUpdates, 5 * 60 * 1000)
    window.addEventListener('focus', checkForUpdates)
    document.addEventListener('visibilitychange', checkForUpdates)
  },
})
setPwaUpdateServiceWorker(updateServiceWorker)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <JWTAuthProvider apiEndpoint={`${API_URL}/api/auth`}>
        <BrowserRouter>
          <ThemeProvider>
            <LanguageProvider><App /></LanguageProvider>
          </ThemeProvider>
        </BrowserRouter>
      </JWTAuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
