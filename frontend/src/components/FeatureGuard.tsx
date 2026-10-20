import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowUpRight, MessageSquare, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFeatureAccess } from "@/services/featureAccessService";
import { useJWTAuth } from "@/contexts/JWTAuthContext";

interface FeatureGuardProps {
  feature: string | string[];
  permission?: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wraps a page or component and only renders children if the feature is enabled.
 * Otherwise shows an UpgradePlan UI.
 * Features are strictly enforced — no offline bypass.
 */
export function FeatureGuard({
  feature,
  permission,
  children,
  fallback,
}: FeatureGuardProps) {
  const { hasFeature, hasAnyFeature, loading, features } = useFeatureAccess();
  const { hasPermission, user } = useJWTAuth();
  const featureEnabled = Array.isArray(feature)
    ? hasAnyFeature(feature)
    : hasFeature(feature);
  const requiredPermissions = Array.isArray(permission)
    ? permission
    : permission
      ? [permission]
      : [];
  const hasRequiredPermission =
    requiredPermissions.length === 0 ||
    requiredPermissions.some((perm) => hasPermission(perm));
  const isOwner = user?.role === "owner" || user?.role === "saas_admin";

  // Only show loading on first load when we have no cached features yet
  if (loading && Object.keys(features).length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-muted-foreground">Loading plan features…</div>
      </div>
    );
  }

  if (!featureEnabled) {
    if (fallback) return <>{fallback}</>;
    return <UpgradePlan feature={feature} />;
  }

  if (permission && !hasRequiredPermission && !isOwner) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Permission Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You do not have permission to access this page. Contact your
              administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Upgrade plan screen shown when a feature is not available.
 */
export function UpgradePlan({ feature }: { feature: string | string[] }) {
  const navigate = useNavigate();
  const featureLabel = (Array.isArray(feature) ? feature[0] || "" : feature)
    .split(".")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" → ");

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
            <span className="font-medium text-foreground">{featureLabel}</span>{" "}
            is not available on your current subscription plan.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => navigate("/tenant/settings")}
              className="w-full"
            >
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Upgrade Plan
            </Button>
            <Button asChild className="w-full bg-green-700 hover:bg-green-800">
              <a
                href="https://wa.me/256788216271?text=Hello%20JibuSales%2C%20I%20would%20like%20to%20discuss%20my%20business%20subscription."
                target="_blank"
                rel="noreferrer"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp JibuSales Support Team
              </a>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <a href="mailto:jibusales00@gmail.coms?subject=JibuSales%20sales%20enquiry">
                Email JibuSales Support Team
              </a>
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() =>
                window.open(
                  "mailto:jibusales00@gmail.com?subject=Custom%20Plan%20Request",
                  "_blank",
                )
              }
            >
              <FileText className="mr-2 h-4 w-4" />
              Request Custom Plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Conditionally render children only if feature is enabled.
 * Renders nothing (null) if the feature is disabled — useful for hiding buttons.
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasFeature } = useFeatureAccess();
  const allowed = hasFeature(feature);
  if (allowed) return <>{children}</>;
  return <>{fallback}</>;
}

export default FeatureGuard;
