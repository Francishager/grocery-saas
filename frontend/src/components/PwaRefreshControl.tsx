import { useState, useSyncExternalStore } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { applyPwaUpdate, getPwaUpdateState, subscribePwaUpdateState } from '@/lib/pwaUpdateState'

export function PwaRefreshControl() {
  const { isAuthenticated } = useJWTAuth()
  const { updateAvailable } = useSyncExternalStore(
    subscribePwaUpdateState,
    getPwaUpdateState,
    getPwaUpdateState,
  )
  const [refreshing, setRefreshing] = useState(false)

  if (!isAuthenticated) return null

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      if (updateAvailable) await applyPwaUpdate()
      else window.location.reload()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      className="fixed z-[70]"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
      }}
    >
      <Button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label={updateAvailable ? 'Update JibuSales' : 'Refresh page'}
        title={updateAvailable ? 'A new JibuSales update is ready' : 'Refresh page'}
        className={`h-12 shadow-lg ${updateAvailable ? 'gap-2 bg-emerald-700 px-4 text-white hover:bg-emerald-800' : 'h-12 w-12 rounded-full p-0'}`}
      >
        {updateAvailable
          ? <><Download className="h-5 w-5" /><span>Update ready</span></>
          : <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />}
      </Button>
    </div>
  )
}
