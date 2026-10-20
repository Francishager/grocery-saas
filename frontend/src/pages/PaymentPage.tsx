import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreditCard, Lock } from "lucide-react";
import { useJWTAuth } from "@/contexts/JWTAuthContext";

export default function PaymentPage() {
  const { user } = useJWTAuth();
  const isTrialTenant = Boolean(
    user?.tenantId &&
    user.tenantStatus === "trial" &&
    user.role !== "saas_admin",
  );

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Make Payment
          </CardTitle>
          <CardDescription>
            {isTrialTenant
              ? "Your business is currently using a trial."
              : "Continue from your subscription invoice to pay the exact amount due through PesaPal"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isTrialTenant ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Lock className="h-8 w-8 text-blue-700" />
              <p className="max-w-md text-sm text-muted-foreground">
                No payment is requested during a trial. Contact JibuSales
                Support Team to discuss upgrading when you are ready.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <a
                  href="https://wa.me/256788216271?text=Hello%20JibuSales%2C%20I%20would%20like%20to%20discuss%20upgrading%20my%20business%20account."
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
                >
                  WhatsApp JibuSales Support Team
                </a>
                <a
                  href="mailto:jibusales00@gmail.com?subject=JibuSales%20trial%20upgrade%20request"
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Email JibuSales Support Team
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <Lock className="h-8 w-8 text-blue-700" />
              <p className="max-w-md text-sm text-muted-foreground">
                Subscription payments must be tied to your invoice so JibuSales can send the correct amount, phone number, and email to PesaPal.
              </p>
              <a href="/tenant/settings" className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                <CreditCard className="h-4 w-4" /> Review invoice and pay
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
