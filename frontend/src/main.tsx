import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { JWTAuthProvider } from './contexts/JWTAuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { getApiBaseUrl } from './lib/apiConfig'
import './lib/utils'
import './index.css'

const API_URL = getApiBaseUrl()
let refreshingForNewServiceWorker = false

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForNewServiceWorker) return
    refreshingForNewServiceWorker = true
    window.location.reload()
  })
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <JWTAuthProvider apiEndpoint={`${API_URL}/api/auth`}>
        <App />
      </JWTAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
