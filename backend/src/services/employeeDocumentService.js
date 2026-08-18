import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
      fileUrl,
      fileName,
      issueDate,
      expiryDate,
      notes,
      uploadedBy,
    } = data;

    if (!employeeId || !documentType || !fileUrl || !fileName || !uploadedBy) {
      throw new Error('Employee, document type, document file, file name, and uploader are required');
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
          fileUrl,
          fileName,
          uploadedBy,
          issueDate: optionalDate(issueDate || data.issuedDate),
          expiryDate: optionalDate(expiryDate),
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
    const { skip = 0, take = 50, documentType = null } = options;

    const where = {
      tenantId,
      employeeId,
      ...(documentType && { documentType }),
    };

    return prisma.employeeDocument.findMany({
      where,
      skip,
      take,
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Get all documents for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Documents list
   */
  async getDocuments(tenantId, options = {}) {
    const { skip = 0, take = 100, employeeId = null, documentType = null, search = null } = options;

    return prisma.employeeDocument.findMany({
      where: {
        tenantId,
        ...(employeeId && { employeeId }),
        ...(documentType && { documentType }),
        ...(search && {
          OR: [
            { fileName: { contains: search, mode: 'insensitive' } },
            { documentType: { contains: search, mode: 'insensitive' } },
            { employee: { is: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { employeeNumber: { contains: search, mode: 'insensitive' } },
              ],
            } } },
          ],
        }),
      },
      skip,
      take,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            profilePhoto: true,
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
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

    const { documentType, fileName, fileUrl, issueDate, expiryDate, notes } = data;

    const updateData = {};
    if (documentType !== undefined) updateData.documentType = documentType;
    if (fileName !== undefined) updateData.fileName = fileName;
    if (fileUrl !== undefined) updateData.fileUrl = fileUrl;
    if (issueDate !== undefined || data.issuedDate !== undefined) updateData.issueDate = optionalDate(issueDate || data.issuedDate);
    if (expiryDate !== undefined) updateData.expiryDate = optionalDate(expiryDate);
    if (notes !== undefined) updateData.notes = notes;

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
  async deleteDocument(tenantId, documentId) {
    await this.getDocumentById(tenantId, documentId);

    return await prisma.employeeDocument.delete({
      where: { id: documentId },
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
      orderBy: { uploadedAt: 'desc' },
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
