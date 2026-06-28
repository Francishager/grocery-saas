import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, ArrowUpRight, MessageSquare, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFeatureAccess } from '@/services/featureAccessService'

interface FeatureGuardProps {
  feature: string
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Wraps a page or component and only renders children if the feature is enabled.
 * Otherwise shows an UpgradePlan UI.
 */
export function FeatureGuard({ feature, children, fallback }: FeatureGuardProps) {
  const { hasFeature, loading, features } = useFeatureAccess()

  // Only show loading on first load when we have no cached features yet
  if (loading && Object.keys(features).length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-muted-foreground">Loading plan features…</div>
      </div>
    )
  }

  if (hasFeature(feature)) {
    return <>{children}</>
  }

  if (fallback) return <>{fallback}</>

  return <UpgradePlan feature={feature} />
}

/**
 * Upgrade plan screen shown when a feature is not available.
 */
export function UpgradePlan({ feature }: { feature: string }) {
  const navigate = useNavigate()
  const featureLabel = feature
    .split('.')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' → ')

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Lock className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-xl">Feature Not Available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{featureLabel}</span> is not
            available on your current subscription plan.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => navigate('/tenant/settings')} className="w-full">
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Upgrade Plan
            </Button>
            <Button variant="outline" className="w-full" onClick={() => window.open('mailto:sales@jibusales.com', '_blank')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Contact Sales
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => window.open('mailto:support@jibusales.com?subject=Custom%20Plan%20Request', '_blank')}>
              <FileText className="mr-2 h-4 w-4" />
              Request Custom Plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Conditionally render children only if feature is enabled.
 * Renders nothing (null) if the feature is disabled — useful for hiding buttons.
 */
export function FeatureGate({ feature, children, fallback = null }: { feature: string; children: ReactNode; fallback?: ReactNode }) {
  const { hasFeature } = useFeatureAccess()
  if (hasFeature(feature)) return <>{children}</>
  return <>{fallback}</>
}

export default FeatureGuard
