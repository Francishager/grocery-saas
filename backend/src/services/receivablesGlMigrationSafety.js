export const journalSummary = (entry) => ({
  id: entry.id,
  entryNo: entry.entryNo,
  sourceType: entry.sourceType,
  sourceId: entry.sourceId,
  status: entry.status,
  reference: entry.reference,
  date: entry.date,
})

export function findPotentialLegacyJournalMatches(action, journals = []) {
  const reference = String(action.reference || '').trim().toLowerCase()
  return journals.filter((entry) => {
    if (entry.sourceType === action.sourceType && entry.sourceId === action.sourceId) return false
    const sourceIdCollision = entry.sourceId === action.sourceId
    const entryReference = String(entry.reference || '').trim().toLowerCase()
    const entryNo = String(entry.entryNo || '').trim().toLowerCase()
    const description = String(entry.description || '').toLowerCase()
    const sameReference = reference && (entryReference === reference || entryNo === reference || description.includes(reference))
    const invoiceReceiptPair = (action.sourceType === 'CUSTOMER_RECEIPT' && entry.sourceType === 'RECEIVABLE_SALE') || (action.sourceType === 'RECEIVABLE_SALE' && entry.sourceType === 'CUSTOMER_RECEIPT')
    return sourceIdCollision || (sameReference && !invoiceReceiptPair)
  })
}
