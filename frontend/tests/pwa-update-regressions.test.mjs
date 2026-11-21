import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const updateControl = readFileSync(new URL('../src/components/PwaRefreshControl.tsx', import.meta.url), 'utf8')

test('PWA updates are offered to the refresh control instead of silently auto-activating', () => {
  assert.match(viteConfig, /registerType:\s*'prompt'/)
  assert.doesNotMatch(viteConfig, /registerType:\s*'autoUpdate'/)
  assert.match(main, /onNeedRefresh:\s*notifyPwaUpdateAvailable/)
  assert.match(main, /registration\.waiting\s*&&\s*navigator\.serviceWorker\.controller/)
})

test('PWA update checks run at startup, periodically, and when the app returns online or foreground', () => {
  assert.match(main, /checkForUpdates\(\)\s*\n\s*window\.setInterval\(checkForUpdates,\s*5\s*\*\s*60\s*\*\s*1000\)/)
  assert.match(main, /addEventListener\('focus',\s*checkForUpdates\)/)
  assert.match(main, /addEventListener\('visibilitychange',\s*checkForUpdates\)/)
  assert.match(main, /addEventListener\('online',\s*checkForUpdates\)/)
  assert.match(updateControl, /updateAvailable\s*\?\s*'Update JibuSales'\s*:\s*'Refresh page'/)
})
