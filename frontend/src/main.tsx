import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
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
    <ThemeProvider>
      <JWTAuthProvider apiEndpoint={`${API_URL}/api/auth`}>
        <LanguageProvider><App /></LanguageProvider>
      </JWTAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
