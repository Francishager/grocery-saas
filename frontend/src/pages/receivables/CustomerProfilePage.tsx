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
      onRecordPayment={(customer) => navigate('/tenant/receivables/customers', { state: { customerAction: { type: 'payment', customer } } })}
      onWithdraw={(customer) => navigate('/tenant/receivables/customers', { state: { customerAction: { type: 'withdrawal', customer } } })}
      onEditCustomer={(customer) => navigate('/tenant/receivables/customers', { state: { customerAction: { type: 'edit', customer } } })}
      onDeleteCustomer={(customer) => navigate('/tenant/receivables/customers', { state: { customerAction: { type: 'delete', customer } } })}
      onOpenChange={(open) => {
        if (!open) navigate('/tenant/receivables/customers')
      }}
    />
  )
}
