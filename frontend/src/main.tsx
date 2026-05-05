import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { JWTAuthProvider } from './contexts/JWTAuthContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JWTAuthProvider>
      <App />
    </JWTAuthProvider>
  </StrictMode>,
)
