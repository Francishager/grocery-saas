import { scopedWhere } from '../utils/branchAccess.js'
import { calculateCustomerReceivableBalance, reconcileCustomerReceivableBalance } from '../utils/customerBalance.js'
import { syncLinkedTransactionAccountBalance } from '../utils/accountingSync.js'

const fail = (message, code, statusCode = 400, details = {}) => Object.assign(new Error(message), { statusCode, code, ...details })

export async function recordCustomerWithdrawal(client, {
  scope, customerId, amount, userId, paymentMethod = 'cash', reference, notes,
  mobileProvider, phoneNumber, transactionId, resolveAccount,
}) {
  if (!customerId) throw fail('Customer is required', 'CUSTOMER_REQUIRED')
  const value = typeof amount === 'number' || typeof amount === 'string' ? Number(amount) : NaN
  const cents = Math.round(value * 100)
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(cents) || cents <= 0 || Math.abs(value * 100 - cents) > 0.000001) {
    throw fail('Withdrawal amount must be greater than zero with at most two decimal places', 'INVALID_WITHDRAWAL_AMOUNT')
  }
  const withdrawalAmount = cents / 100

  try {
    return await client.$transaction(async (tx) => {
      // Serialize payouts for one customer, and read their ledger inside the same transaction.
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} AND "tenantId" = ${scope.tenantId} FOR UPDATE`
      const customer = await tx.customer.findFirst({ where: scopedWhere(scope, { id: customerId }) })
      if (!customer) throw fail('Customer not found', 'CUSTOMER_NOT_FOUND', 404)
      if (customer.status !== 'active') throw fail('Customer is not active', 'CUSTOMER_INACTIVE')

      const snapshot = await calculateCustomerReceivableBalance(tx, scope, customerId)
      if (!snapshot || !Number.isFinite(snapshot.balance)) throw fail('Customer balance could not be verified', 'CUSTOMER_BALANCE_UNAVAILABLE', 409)
      const availableFunds = Math.max(0, -snapshot.balance)
      if (withdrawalAmount > availableFunds) {
        throw fail(`Withdrawal exceeds ${customer.name || 'this customer'}'s available funds of ${availableFunds.toFixed(2)}.`,
          'INSUFFICIENT_CUSTOMER_FUNDS', 400, { availableFunds, currentBalance: snapshot.balance })
      }

      const account = await resolveAccount(tx)
      // Conditional debit protects a shared till from simultaneous payouts to different customers.
      const debited = await tx.cashAccount.updateMany({
        where: { id: account.id, tenantId: scope.tenantId, isActive: true, balance: { gte: withdrawalAmount } },
        data: { balance: { decrement: withdrawalAmount } },
      })
      if (debited.count !== 1) throw fail(`Insufficient available balance in ${account.name}.`, 'INSUFFICIENT_ACCOUNT_BALANCE')
      const updatedAccount = await tx.cashAccount.findUnique({ where: { id: account.id } })
      const withdrawalReference = reference || `WD-${Date.now()}`
      const withdrawal = await tx.customerWithdrawal.create({
        data: {
          tenantId: scope.tenantId, branchId: scope.branchId, customerId, userId,
          cashAccountId: account.id, amount: withdrawalAmount, paymentMethod,
          mobileProvider: paymentMethod === 'mobile_money' ? mobileProvider : null,
          phoneNumber: paymentMethod === 'mobile_money' ? phoneNumber : null,
          transactionId: ['mobile_money', 'card'].includes(paymentMethod) ? transactionId : null,
          reference: withdrawalReference, notes,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, balance: true, creditLimit: true } },
          branch: { select: { id: true, name: true } },
          cashAccount: { select: { id: true, name: true, type: true, balance: true } },
          user: { select: { id: true, fname: true, lname: true } },
        },
      })
      await tx.cashTransaction.create({ data: {
        tenantId: scope.tenantId, accountId: account.id, type: 'withdrawal', amount: withdrawalAmount,
        balanceAfter: updatedAccount.balance, reference: withdrawalReference,
        description: `Customer withdrawal: ${customer.name || customer.email}`, userId,
      } })
      await syncLinkedTransactionAccountBalance(tx, scope.tenantId, account.id)
      const reconciled = await reconcileCustomerReceivableBalance(tx, scope, customerId)
      if (!reconciled || reconciled.balance > 0) throw fail('Customer funds changed. Refresh the balance and try again.', 'CUSTOMER_FUNDS_CHANGED', 409)
      return {
        ...withdrawal,
        cashAccount: { ...withdrawal.cashAccount, balance: updatedAccount.balance },
        customer: { ...withdrawal.customer, balance: reconciled.balance },
      }
    }, { isolationLevel: 'Serializable', timeout: 15000 })
  } catch (error) {
    if (error.code === 'P2034') throw fail('Customer or account funds changed. Refresh the balance and try again.', 'CUSTOMER_FUNDS_CHANGED', 409)
    throw error
  }
}
