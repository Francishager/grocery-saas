import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditCard, Lock } from 'lucide-react'

export default function PaymentPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Make Payment
          </CardTitle>
          <CardDescription>
            Complete your subscription payment securely through PesaPal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span>Secure payment powered by PesaPal</span>
            </div>
            <iframe
              width="100%"
              height="600"
              src="https://store.pesapal.com/embed-code?pageUrl=https://store.pesapal.com/jibusalesservices"
              frameBorder="0"
              allowFullScreen
              className="rounded-lg border"
              title="PesaPal Payment"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
