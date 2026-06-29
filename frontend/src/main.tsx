import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { JWTAuthProvider } from './contexts/JWTAuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <JWTAuthProvider apiEndpoint={`${API_URL}/api/auth`}>
        <App />
      </JWTAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
