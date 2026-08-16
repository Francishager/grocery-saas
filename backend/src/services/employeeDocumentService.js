import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * EmployeeDocumentService - Manages employee documents
 */

class EmployeeDocumentService {
  /**
   * Upload/Create a document
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Document data
   * @returns {Promise<object>} Created document
   */
  async uploadDocument(tenantId, data) {
    const {
      employeeId,
      documentType,
      documentName,
      fileUrl,
      fileName,
      fileSize,
      mimeType,
      expiryDate,
      issuedDate,
      issuedBy,
      notes,
      uploadedBy,
    } = data;

    if (!employeeId || !documentType || !fileName || !uploadedBy) {
      throw new Error('Employee ID, document type, file name, and uploader are required');
    }

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    try {
      return await prisma.employeeDocument.create({
        data: {
          tenantId,
          employeeId,
          documentType,
          documentName,
          fileUrl,
          fileName,
          fileSize,
          mimeType,
          status: 'active',
          uploadedDate: new Date(),
          uploadedBy,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          issuedDate: issuedDate ? new Date(issuedDate) : null,
          issuedBy,
          notes,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get documents for an employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Documents list
   */
  async getEmployeeDocuments(tenantId, employeeId, options = {}) {
    const { skip = 0, take = 50, documentType = null, status = 'active' } = options;

    const where = {
      tenantId,
      employeeId,
      ...(status && { status }),
      ...(documentType && { documentType }),
    };

    return prisma.employeeDocument.findMany({
      where,
      skip,
      take,
      orderBy: { uploadedDate: 'desc' },
    });
  }

  /**
   * Get document by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} documentId - Document ID
   * @returns {Promise<object>} Document data
   */
  async getDocumentById(tenantId, documentId) {
    const document = await prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
      },
      include: {
        employee: true,
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  /**
   * Update document
   * @param {string} tenantId - Tenant ID
   * @param {string} documentId - Document ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated document
   */
  async updateDocument(tenantId, documentId, data) {
    const document = await this.getDocumentById(tenantId, documentId);

    if (document.status === 'archived') {
      throw new Error('Cannot update archived document');
    }

    const { documentName, expiryDate, issuedDate, issuedBy, notes, status } = data;

    const updateData = {};
    if (documentName !== undefined) updateData.documentName = documentName;
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (issuedDate !== undefined) updateData.issuedDate = issuedDate ? new Date(issuedDate) : null;
    if (issuedBy !== undefined) updateData.issuedBy = issuedBy;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    return await prisma.employeeDocument.update({
      where: { id: documentId },
      data: updateData,
    });
  }

  /**
   * Archive/Delete document
   * @param {string} tenantId - Tenant ID
   * @param {string} documentId - Document ID
   * @returns {Promise<object>} Archived document
   */
  async archiveDocument(tenantId, documentId) {
    const document = await this.getDocumentById(tenantId, documentId);

    return await prisma.employeeDocument.update({
      where: { id: documentId },
      data: {
        status: 'archived',
        archivedDate: new Date(),
      },
    });
  }

  /**
   * Get expiring documents
   * @param {string} tenantId - Tenant ID
   * @param {number} daysFromNow - Check expiry within N days
   * @returns {Promise<array>} Expiring documents
   */
  async getExpiringDocuments(tenantId, daysFromNow = 30) {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);

    return prisma.employeeDocument.findMany({
      where: {
        tenantId,
        status: 'active',
        expiryDate: {
          gte: now,
          lte: expiryDate,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  /**
   * Get documents by type
   * @param {string} tenantId - Tenant ID
   * @param {string} documentType - Type of document
   * @param {object} options - Filter options
   * @returns {Promise<array>} Documents of type
   */
  async getDocumentsByType(tenantId, documentType, options = {}) {
    const { skip = 0, take = 50 } = options;

    return prisma.employeeDocument.findMany({
      where: {
        tenantId,
        documentType,
        status: 'active',
      },
      skip,
      take,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { uploadedDate: 'desc' },
    });
  }

  /**
   * Check document expiry status
   * @param {string} tenantId - Tenant ID
   * @param {string} documentId - Document ID
   * @returns {Promise<object>} Expiry status
   */
  async checkDocumentExpiry(tenantId, documentId) {
    const document = await this.getDocumentById(tenantId, documentId);

    if (!document.expiryDate) {
      return { status: 'noExpiry', daysRemaining: null };
    }

    const now = new Date();
    const daysRemaining = Math.ceil((document.expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return { status: 'expired', daysRemaining };
    } else if (daysRemaining <= 30) {
      return { status: 'expiring', daysRemaining };
    } else {
      return { status: 'valid', daysRemaining };
    }
  }
}

export default new EmployeeDocumentService();
