import { RefreshCw, Wifi, WifiOff, Cloud, CloudOff, CheckCircle2 } from 'lucide-react'
import { useSyncStatus, useSyncStats, useSyncNow, useOnlineStatus } from '@/db/hooks'

export function SyncIndicator() {
  const status = useSyncStatus()
  const stats = useSyncStats()
  const { syncing, syncNow } = useSyncNow()
  const online = useOnlineStatus()

  const isOffline = !online || status === 'offline'
  const isSyncing = status === 'syncing' || syncing

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Online/Offline badge */}
      <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-medium ${
        isOffline ? 'bg-orange-500/15 text-orange-600' : 'bg-green-500/10 text-green-600'
      }`}>
        {isOffline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
        <span>{isOffline ? 'Offline' : 'Online'}</span>
      </div>

      {/* Sync status — hidden when offline */}
      {!isOffline && (
        <button
          onClick={() => syncNow()}
          disabled={isSyncing}
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-medium transition-colors ${
            isSyncing
              ? 'bg-blue-500/10 text-blue-600'
              : stats.pending > 0
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-slate-500/10 text-slate-600'
          } hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50`}
          title={stats.lastPull ? `Last synced: ${new Date(stats.lastPull).toLocaleString()}` : 'Not yet synced'}
        >
          {isSyncing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : stats.pending > 0 ? (
            <CloudOff className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isSyncing ? 'Syncing...' : stats.pending > 0 ? `${stats.pending} pending` : 'Synced'}
          </span>
        </button>
      )}
    </div>
  )
}
