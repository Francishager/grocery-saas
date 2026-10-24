import { useNavigate, useParams } from 'react-router-dom'
import CustomerTransactionHistoryDialog from '@/components/customer/CustomerTransactionHistoryDialog'

export default function CustomerProfilePage() {
  const { customerId } = useParams()
  const navigate = useNavigate()

  if (!customerId) return null

  return (
    <CustomerTransactionHistoryDialog
      customer={{ id: customerId }}
      open
      presentation="page"
      onOpenChange={(open) => {
        if (!open) navigate('/tenant/receivables/customers')
      }}
    />
  )
}
