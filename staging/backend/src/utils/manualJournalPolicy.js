export function isProtectedManualJournalAccount(account, protectedAccountIds = new Set()) {
  return Boolean(account && (account.isSystemManaged || protectedAccountIds.has(account.id)));
}

export function validateProtectedManualJournalPosting({
  accounts,
  protectedAccountIds,
  exemptAccountIds = new Set(),
  canPostToProtectedAccounts,
  reason,
  reference,
}) {
  const protectedAccounts = accounts.filter((account) =>
    !exemptAccountIds.has(account.id) && isProtectedManualJournalAccount(account, protectedAccountIds),
  );
  if (!protectedAccounts.length) return { ok: true, protectedAccounts };
  if (!canPostToProtectedAccounts) {
    return {
      ok: false,
      status: 403,
      error: `${protectedAccounts[0].name} is protected from ordinary manual journal entries. Use its normal workflow or request the protected-account posting permission.`,
    };
  }
  if (!String(reason || '').trim() || !String(reference || '').trim()) {
    return {
      ok: false,
      status: 400,
      error: 'Protected-account corrections require both a specific reason in the description and a supporting reference.',
    };
  }
  return { ok: true, protectedAccounts };
}
