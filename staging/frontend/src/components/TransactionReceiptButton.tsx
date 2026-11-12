import ReceiptViewer from '@/components/ReceiptViewer'
import type { TransactionReceiptData } from '@/lib/transactionReceipt'

export default function TransactionReceiptButton({ data, label = 'Print receipt' }: { data: TransactionReceiptData; label?: string }) {
  return <ReceiptViewer receiptNo={data.reference} transactionData={data} triggerLabel={label} previewOnTrigger />
}
