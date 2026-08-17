/**
 * Journal Entry Service - Phase 3 Financial Management
 * Handles journal entry creation, posting, reversal, and reconciliation
 */

class JournalEntryService {
  // Create new journal entry (draft)
  async createEntry(tenantId, data) {
    try {
      const { entryNo, description, referenceNo, branchId, createdBy, lines } = data;

      if (!entryNo || !lines || lines.length === 0) {
        throw new Error('Entry number and at least 2 lines are required');
      }

      // Validate lines sum to zero
      let totalDebit = 0, totalCredit = 0;
      const validatedLines = [];

      for (const line of lines) {
        if (!line.accountId || (!line.debitAmount && !line.creditAmount)) {
          throw new Error('Each line must have account and debit or credit amount');
        }
        totalDebit += line.debitAmount || 0;
        totalCredit += line.creditAmount || 0;
        validatedLines.push(line);
      }

      // Must balance (debit = credit)
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Entry does not balance. Debit: ${totalDebit}, Credit: ${totalCredit}`);
      }

      // Create entry with lines
      const entry = await db.journalEntry.create({
        data: {
          tenantId,
          entryNo,
          description,
          referenceNo,
          branchId: branchId || null,
          totalDebit,
          totalCredit,
          status: 'draft',
          createdBy,
          lines: {
            createMany: {
              data: validatedLines.map((line, idx) => ({
                accountId: line.accountId,
                debitAmount: line.debitAmount || 0,
                creditAmount: line.creditAmount || 0,
                description: line.description,
                lineNo: idx + 1,
              })),
            },
          },
        },
        include: { lines: true },
      });

      return entry;
    } catch (error) {
      throw new Error(`Failed to create journal entry: ${error.message}`);
    }
  }

  // Post entry (mark as official)
  async postEntry(tenantId, entryId, approvedBy) {
    try {
      const entry = await db.journalEntry.findUnique({
        where: { id: entryId, tenantId },
      });

      if (!entry) throw new Error('Entry not found');
      if (entry.status !== 'draft') throw new Error('Only draft entries can be posted');

      const posted = await db.journalEntry.update({
        where: { id: entryId },
        data: {
          status: 'posted',
          approvedBy,
          approvedAt: new Date(),
        },
        include: { lines: true },
      });

      return posted;
    } catch (error) {
      throw new Error(`Failed to post entry: ${error.message}`);
    }
  }

  // Reverse entry (create reversing entry)
  async reverseEntry(tenantId, entryId, reversalReason, createdBy) {
    try {
      const entry = await db.journalEntry.findUnique({
        where: { id: entryId, tenantId },
        include: { lines: true },
      });

      if (!entry) throw new Error('Entry not found');
      if (entry.status !== 'posted') throw new Error('Only posted entries can be reversed');

      // Create reversing entry with swapped debit/credit
      const newEntryNo = `${entry.entryNo}-REV`;
      const reversingLines = entry.lines.map(line => ({
        accountId: line.accountId,
        debitAmount: line.creditAmount,
        creditAmount: line.debitAmount,
        description: `Reversal of line ${line.lineNo}`,
      }));

      const reversingEntry = await db.journalEntry.create({
        data: {
          tenantId,
          entryNo: newEntryNo,
          description: `Reversal of ${entry.entryNo}`,
          reversedJournalId: entryId,
          status: 'posted',
          totalDebit: entry.totalCredit,
          totalCredit: entry.totalDebit,
          reversalDate: new Date(),
          reversalReason,
          createdBy,
          approvedBy: createdBy,
          approvedAt: new Date(),
          lines: {
            createMany: {
              data: reversingLines.map((line, idx) => ({
                ...line,
                lineNo: idx + 1,
              })),
            },
          },
        },
        include: { lines: true },
      });

      // Mark original as reversed
      await db.journalEntry.update({
        where: { id: entryId },
        data: { status: 'reversed' },
      });

      return reversingEntry;
    } catch (error) {
      throw new Error(`Failed to reverse entry: ${error.message}`);
    }
  }

  // Get entries with filters
  async getEntries(tenantId, filters = {}) {
    try {
      const { status, branchId, startDate, endDate, skip, take } = filters;

      const entries = await db.journalEntry.findMany({
        where: {
          tenantId,
          ...(status && { status }),
          ...(branchId && { branchId }),
          ...(startDate && endDate && {
            postDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: { lines: { include: { account: true } } },
        orderBy: { postDate: 'desc' },
        skip: skip || 0,
        take: take || 50,
      });

      return entries;
    } catch (error) {
      throw new Error(`Failed to fetch entries: ${error.message}`);
    }
  }

  // Get single entry
  async getEntryById(tenantId, entryId) {
    try {
      const entry = await db.journalEntry.findUnique({
        where: { id: entryId, tenantId },
        include: { lines: { include: { account: true } } },
      });

      if (!entry) throw new Error('Entry not found');
      return entry;
    } catch (error) {
      throw new Error(`Failed to fetch entry: ${error.message}`);
    }
  }

  // Update entry (only if draft)
  async updateEntry(tenantId, entryId, data) {
    try {
      const entry = await db.journalEntry.findUnique({
        where: { id: entryId, tenantId },
      });

      if (!entry) throw new Error('Entry not found');
      if (entry.status !== 'draft') throw new Error('Can only update draft entries');

      const updated = await db.journalEntry.update({
        where: { id: entryId },
        data: {
          description: data.description,
          referenceNo: data.referenceNo,
          updatedAt: new Date(),
        },
        include: { lines: true },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to update entry: ${error.message}`);
    }
  }

  // Delete entry (only if draft)
  async deleteEntry(tenantId, entryId) {
    try {
      const entry = await db.journalEntry.findUnique({
        where: { id: entryId, tenantId },
      });

      if (!entry) throw new Error('Entry not found');
      if (entry.status !== 'draft') throw new Error('Can only delete draft entries');

      // Delete lines first
      await db.journalEntryLine.deleteMany({
        where: { journalEntryId: entryId },
      });

      // Delete entry
      await db.journalEntry.delete({
        where: { id: entryId },
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete entry: ${error.message}`);
    }
  }
}

module.exports = new JournalEntryService();
