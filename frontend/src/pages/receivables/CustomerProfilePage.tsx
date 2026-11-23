import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CustomerTransactionHistoryDialog, { type CustomerHistoryTarget } from '@/components/customer/CustomerTransactionHistoryDialog'
import CustomerPaymentDialog from '@/components/customer/CustomerPaymentDialog'
import CustomerWalletWithdrawalDialog from '@/components/customer/CustomerWalletWithdrawalDialog'

type ProfileActionCustomer = CustomerHistoryTarget & Record<string, unknown> & { id: string }

export default function CustomerProfilePage() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const [paymentCustomer, setPaymentCustomer] = useState<ProfileActionCustomer | null>(null)
  const [withdrawalCustomer, setWithdrawalCustomer] = useState<ProfileActionCustomer | null>(null)
  const [profileVersion, setProfileVersion] = useState(0)

  if (!customerId) return null

  return (
    <>
      <CustomerTransactionHistoryDialog
        key={`${customerId}:${profileVersion}`}
        customer={{ id: customerId }}
        open
        presentation="page"
        onRecordPayment={(customer) => setPaymentCustomer(customer.id ? { ...customer, id: customer.id } : null)}
        onWithdraw={(customer) => setWithdrawalCustomer(customer.id ? { ...customer, id: customer.id } : null)}
        onEditCustomer={(customer) => {
          const tenancy = (customer.rentalTenancies as Array<{ id: string; status?: string }> | undefined)?.find(row => row.status === 'active')
            || (customer.rentalTenancies as Array<{ id: string }> | undefined)?.[0]
          if (tenancy) navigate('/tenant/property-management/tenancies', { state: { editTenancy: tenancy.id } })
          else navigate('/tenant/receivables/customers', { state: { customerAction: { type: 'edit', customer } } })
        }}
        onDeleteCustomer={(customer) => navigate('/tenant/receivables/customers', { state: { customerAction: { type: 'delete', customer } } })}
        onOpenChange={(open) => {
          if (!open) navigate('/tenant/receivables/customers')
        }}
      />
      <CustomerPaymentDialog
        customer={paymentCustomer}
        open={!!paymentCustomer}
        onOpenChange={(open) => { if (!open) setPaymentCustomer(null) }}
        onRecorded={() => setProfileVersion((version) => version + 1)}
      />
      <CustomerWalletWithdrawalDialog
        customer={withdrawalCustomer}
        open={!!withdrawalCustomer}
        onOpenChange={(open) => { if (!open) setWithdrawalCustomer(null) }}
        onRecorded={() => setProfileVersion((version) => version + 1)}
      />
    </>
  )
}
