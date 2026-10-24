import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { printTransactionReceipt, type TransactionReceiptData } from '@/lib/transactionReceipt'

export default function TransactionReceiptButton({ data, label = 'Print receipt' }: { data: TransactionReceiptData; label?: string }) {
  const { toast } = useToast()
  return <Button size="sm" variant="outline" onClick={() => {
    if (!printTransactionReceipt(data)) toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print this transaction receipt.', variant: 'destructive' })
  }}><Printer className="mr-1 h-4 w-4" />{label}</Button>
}
