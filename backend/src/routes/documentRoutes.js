import express from 'express';
import documentService from '../services/employeeDocumentService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /documents - Upload document
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_DOCUMENT_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const document = await documentService.uploadDocument(tenantId, {
      ...req.body,
      uploadedBy: userId,
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /documents/employee/:employeeId - Get employee documents
 */
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;
    const { skip, take, documentType, status } = req.query;

    const documents = await documentService.getEmployeeDocuments(tenantId, employeeId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      documentType,
      status: status || 'active',
    });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /documents/:id - Get document
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const document = await documentService.getDocumentById(tenantId, req.params.id);
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /documents/:id - Update document
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_DOCUMENT_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const document = await documentService.updateDocument(tenantId, req.params.id, req.body);
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /documents/:id/archive - Archive document
 */
router.post('/:id/archive', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_DOCUMENT_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const document = await documentService.archiveDocument(tenantId, req.params.id);
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /documents/expiring/list - Get expiring documents
 */
router.get('/expiring/list', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { days = 30 } = req.query;

    const documents = await documentService.getExpiringDocuments(tenantId, parseInt(days));
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /documents/type/:documentType - Get documents by type
 */
router.get('/type/:documentType', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { documentType } = req.params;
    const { skip, take } = req.query;

    const documents = await documentService.getDocumentsByType(tenantId, documentType, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
    });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
