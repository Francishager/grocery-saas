import React, { FormEvent, useEffect, useState } from 'react'
import { Fingerprint, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import { getApiAuthEndpoint } from '@/lib/apiConfig'
import { useJWTAuth } from '@/contexts/JWTAuthContext'

type SecurityStatus = { setupRequired: boolean; method: 'passkey' | 'password' | null; passkeyCount: number }

export default function SecurityEnrollmentPage({ onCompleted }: { onCompleted?: () => void }) {
  const { user, tokens, updateUser, logout } = useJWTAuth()
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [password, setPassword] = useState('')
  const [passkeyName, setPasskeyName] = useState('This device')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const authRequest = async (path: string, body?: Record<string, unknown>) => {
    if (!tokens?.accessToken) throw new Error('Sign in again to set up account security.')
    const response = await fetch(`${getApiAuthEndpoint()}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${tokens.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || data.message || 'Could not verify account security.')
    return data
  }

  const loadStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await authRequest('/security/status') as SecurityStatus
      setStatus(result)
      if (!result.setupRequired) {
        updateUser({ securitySetupRequired: false, securityScopeVersion: 1, businessSwitchSecurityMethod: result.method })
        onCompleted?.()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account security could not be checked. Reconnect and retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadStatus() }, [])

  const completeSetup = (method: 'passkey' | 'password', passkeyCount: number) => {
    updateUser({ securitySetupRequired: false, securityScopeVersion: 1, businessSwitchSecurityMethod: method })
    setStatus({ setupRequired: false, method, passkeyCount })
    onCompleted?.()
  }

  const enrollPasskey = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      if (!window.isSecureContext || !('PublicKeyCredential' in window)) throw new Error('Passkeys are unavailable in this browser. Use a supported HTTPS browser or choose password confirmation.')
      const options = await authRequest('/security/passkey/register/options', { password })
      const response = await startRegistration({ optionsJSON: options })
      const result = await authRequest('/security/passkey/register/verify', { response, name: passkeyName })
      setPassword('')
      completeSetup('passkey', Number(result.passkeyCount || 1))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey setup failed. Try again or choose password confirmation.')
    } finally {
      setWorking(false)
    }
  }

  const enablePasswordConfirmation = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      const result = await authRequest('/security/password-method', { password })
      setPassword('')
      completeSetup('password', Number(result.passkeyCount || 0))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable password confirmation.')
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-background text-foreground"><Loader2 className="mr-2 size-5 animate-spin" /> Checking account security…</main>
  if (status && !status.setupRequired) return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground"><section className="max-w-md text-center"><ShieldCheck className="mx-auto mb-4 size-12 text-emerald-600" /><h1 className="text-xl font-semibold">Security setup complete</h1><p className="mt-2 text-sm text-muted-foreground">Continue to your JibuSales account.</p><button className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => window.location.reload()}>Continue</button></section></main>

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-xl rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="size-6" /></div>
          <div><h1 className="text-xl font-semibold">Secure your JibuSales account</h1><p className="text-sm text-muted-foreground">One-time setup required before you continue</p></div>
        </div>
        <p className="mb-5 text-sm leading-6 text-muted-foreground">Choose how to confirm your identity whenever you switch businesses. A passkey can use your fingerprint, face, device PIN, or security key. JibuSales never receives biometric data.</p>
        {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        <label className="mb-3 block text-sm font-medium" htmlFor="security-password">Confirm your account password</label>
        <input id="security-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mb-4 h-10 w-full rounded-md border bg-background px-3 text-sm" />
        <form onSubmit={enrollPasskey} className="space-y-3 rounded-md border p-4">
          <div className="flex items-start gap-3"><Fingerprint className="mt-0.5 size-5 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">Recommended: passkey</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Use your device biometrics, device PIN, or a security key. A synced passkey may be available on your other devices.</p></div></div>
          <label className="block text-xs font-medium" htmlFor="passkey-name">Device name</label>
          <input id="passkey-name" maxLength={80} value={passkeyName} onChange={event => setPasskeyName(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          <button type="submit" disabled={working || !password} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{working ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />} Set up passkey</button>
        </form>
        <form onSubmit={enablePasswordConfirmation} className="mt-4 rounded-md border p-4">
          <div className="flex items-start gap-3"><KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><div><h2 className="text-sm font-semibold">Use password confirmation</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">If this device cannot create passkeys, confirm your account password each time you switch businesses.</p></div></div>
          <button type="submit" disabled={working || !password} className="mt-3 h-10 w-full rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">Enable password confirmation</button>
        </form>
        <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Signed in as {user?.email}</span><button type="button" className="text-destructive hover:underline" onClick={() => void logout()}>Sign out</button></div>
      </section>
    </main>
  )
}
