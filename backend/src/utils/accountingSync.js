const LINKED_CASH_ACCOUNT_MARKER = 'cashAccount:'

export function linkedCashAccountId(account) {
  const description = String(account?.description || '').trim()
  const match = description.match(/cashAccount:([^\s]+)/)
  return match?.[1] || null
}

export function isLinkedCashAccountMismatch(cashAccount, linkedAccount) {
  if (!cashAccount || !linkedAccount) return false
  const accountCashId = linkedCashAccountId(linkedAccount)
  if (!accountCashId || accountCashId !== cashAccount.id) return false

  const cashBalance = Number(cashAccount.balance || 0)
  const linkedBalance = Number(linkedAccount.balance || 0)
  return Math.abs(cashBalance - linkedBalance) > 0.01
}

export function reconcileCashAccountBalance(cashAccount, linkedAccount) {
  if (!cashAccount || !linkedAccount) {
    return { needsSync: false, current: 0, targetBalance: 0, syncedBalance: 0 }
  }

  const targetBalance = Number(cashAccount.balance || 0)
  const currentBalance = Number(linkedAccount.balance || 0)
  const needsSync = Math.abs(targetBalance - currentBalance) > 0.01

  return {
    needsSync,
    current: currentBalance,
    targetBalance,
    syncedBalance: targetBalance,
  }
}

export async function syncLinkedTransactionAccountBalance(prismaClient, tenantId, cashAccountId) {
  if (!prismaClient || !tenantId || !cashAccountId) return null

  const cashAccount = await prismaClient.cashAccount.findUnique({
    where: { id: cashAccountId },
  })

  if (!cashAccount) return null

  const linkedAccount = await prismaClient.account.findFirst({
    where: {
      tenantId,
      description: { contains: `${LINKED_CASH_ACCOUNT_MARKER}${cashAccount.id}` },
    },
  })

  if (!linkedAccount) return null

  const result = reconcileCashAccountBalance(cashAccount, linkedAccount)
  if (!result.needsSync) return null

  const synced = await prismaClient.account.update({
    where: { id: linkedAccount.id },
    data: { balance: cashAccount.balance },
  })

  return {
    ...result,
    syncedAccountId: synced.id,
    syncedBalance: Number(synced.balance || 0),
  }
}

export function syncCashAccountBalanceForTransactionAccount({ cashAccount, linkedAccount }) {
  if (!cashAccount || !linkedAccount) return null

  const targetBalance = Number(cashAccount.balance || 0)
  const currentBalance = Number(linkedAccount.balance || 0)
  const mismatch = Math.abs(targetBalance - currentBalance) > 0.01

  if (!mismatch) return null

  return {
    id: linkedAccount.id,
    balance: targetBalance,
    previousBalance: currentBalance,
    matchedCashAccountId: cashAccount.id,
  }
}

export const LINKED_CASH_ACCOUNT_PATTERN = LINKED_CASH_ACCOUNT_MARKER
