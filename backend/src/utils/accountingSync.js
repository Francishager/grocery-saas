const LINKED_CASH_ACCOUNT_MARKER = 'cashAccount:'
const AUTO_DEFAULT_CASH_ACCOUNT_NAMES = new Set(['Cash Box', 'Mobile Money', 'Bank Account', 'Card Payments'])

export const cashAccountMarker = (cashAccountId) => `${LINKED_CASH_ACCOUNT_MARKER}${cashAccountId}`

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

export async function ensureTransactionAccounts(prismaClient, tenantId) {
  if (!prismaClient || !tenantId) return []

  const cashAccounts = await prismaClient.cashAccount.findMany({
    where: { tenantId, isActive: true },
    include: {
      _count: {
        select: {
          AssignedUsers: true,
          CashTransaction: true,
          Expense: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const linkedAccounts = []

  for (const cashAccount of cashAccounts) {
    const marker = cashAccountMarker(cashAccount.id)
    const description = `Linked transaction account ${marker}`
    const subType = `transaction_${cashAccount.type}`
    const existing = await prismaClient.account.findFirst({
      where: { tenantId, description: { contains: marker } },
      include: { _count: { select: { journalLines: true, children: true } } },
    })
    const isUnusedAutoDefault =
      AUTO_DEFAULT_CASH_ACCOUNT_NAMES.has(cashAccount.name) &&
      Number(cashAccount.balance || 0) === 0 &&
      Number(cashAccount._count?.AssignedUsers || 0) === 0 &&
      Number(cashAccount._count?.CashTransaction || 0) === 0 &&
      Number(cashAccount._count?.Expense || 0) === 0

    if (isUnusedAutoDefault) {
      if (existing && Number(existing._count?.journalLines || 0) === 0 && Number(existing._count?.children || 0) === 0) {
        await prismaClient.account.delete({ where: { id: existing.id } })
      }
      continue
    }

    if (existing) {
      linkedAccounts.push(await prismaClient.account.update({
        where: { id: existing.id },
        data: {
          name: cashAccount.name,
          type: 'asset',
          subType,
          balance: cashAccount.balance,
          isActive: cashAccount.isActive,
          description,
        },
      }))
      continue
    }

    let code = `TX-${cashAccount.id.slice(-8).toUpperCase()}`
    let suffix = 1
    while (await prismaClient.account.findFirst({ where: { tenantId, code } })) {
      code = `TX-${cashAccount.id.slice(-6).toUpperCase()}-${suffix++}`
    }

    linkedAccounts.push(await prismaClient.account.create({
      data: {
        tenantId,
        code,
        name: cashAccount.name,
        type: 'asset',
        subType,
        balance: cashAccount.balance,
        description,
      },
    }))
  }

  return linkedAccounts
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
