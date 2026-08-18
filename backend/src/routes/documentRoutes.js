import express from 'express';
import multer from 'multer';
import documentService from '../services/employeeDocumentService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';
import { safeCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinaryUpload.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const tenantIdFromRequest = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id || req.tenantId;

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /documents - Upload document
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_DOCUMENT_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please select a document file to upload' });
    }

    const cloudResult = await uploadBufferToCloudinary(req.file.buffer, {
      folder: `jibusales/hr/${tenantId}/documents`,
      publicId: `${Date.now()}-${safeCloudinaryId(req.file.originalname)}`,
      resourceType: 'auto',
    });

    const document = await documentService.uploadDocument(tenantId, {
      ...req.body,
      fileUrl: cloudResult.secure_url,
      fileName: req.file.originalname,
      uploadedBy: userId,
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /documents - List documents
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_DOCUMENT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { skip, take, employeeId, documentType, search } = req.query;
    const documents = await documentService.getDocuments(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 100,
      employeeId,
      documentType,
      search,
    });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /documents/employee/:employeeId - Get employee documents
 */
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
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
 * GET /documents/expiring/list - Get expiring documents
 */
router.get('/expiring/list', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
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
    const tenantId = tenantIdFromRequest(req);
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

/**
 * GET /documents/:id - Get document
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
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
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

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
 * DELETE /documents/:id - Delete document
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_DOCUMENT_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const document = await documentService.deleteDocument(tenantId, req.params.id);
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
