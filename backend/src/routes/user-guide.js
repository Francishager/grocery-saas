import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import multer from "multer";
import cloudinary from "cloudinary";

const router = Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Get all guide steps, optionally filtered by category
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    const where = category ? { category } : {};
    const steps = await prisma.userGuideStep.findMany({
      where,
      orderBy: [{ category: "asc" }, { stepNumber: "asc" }],
    });
    res.json(steps);
  } catch (err) {
    console.error("Get guide steps error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get steps grouped by category (for the public user guide menu)
router.get("/grouped", authenticateToken, async (req, res) => {
  try {
    const steps = await prisma.userGuideStep.findMany({
      orderBy: [{ category: "asc" }, { stepNumber: "asc" }],
    });
    const grouped = {};
    for (const step of steps) {
      if (!grouped[step.category]) grouped[step.category] = [];
      grouped[step.category].push(step);
    }
    res.json(grouped);
  } catch (err) {
    console.error("Get grouped guide steps error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new guide step
router.post("/", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { category, stepNumber, title, description, imageUrl, imagePublicId } = req.body;
    if (!category || !title || !description) {
      return res.status(400).json({ error: "category, title, and description are required" });
    }
    const step = await prisma.userGuideStep.create({
      data: {
        category,
        stepNumber: stepNumber || 1,
        title,
        description,
        imageUrl: imageUrl || null,
        imagePublicId: imagePublicId || null,
      },
    });
    res.status(201).json({ message: "Guide step created", step });
  } catch (err) {
    console.error("Create guide step error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upload image for a guide step
router.post("/:id/image", authenticateToken, requirePlatformAdmin, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const step = await prisma.userGuideStep.findUnique({ where: { id: req.params.id } });
    if (!step) return res.status(404).json({ error: "Guide step not found" });

    // Delete old image from Cloudinary if exists
    if (step.imagePublicId) {
      try {
        await cloudinary.v2.uploader.destroy(step.imagePublicId);
      } catch (e) {
        console.warn("Failed to delete old image:", e.message);
      }
    }

    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: `jibusales/guide-steps`, public_id: `guide-${req.params.id}-${Date.now()}`, overwrite: true },
      async (error, cloudResult) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json({ error: "Failed to upload image" });
        }
        const updated = await prisma.userGuideStep.update({
          where: { id: req.params.id },
          data: {
            imageUrl: cloudResult.secure_url,
            imagePublicId: cloudResult.public_id,
          },
        });
        res.json({ message: "Image uploaded", step: updated });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    console.error("Upload guide image error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a guide step
router.put("/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { category, stepNumber, title, description, imageUrl, imagePublicId } = req.body;
    const step = await prisma.userGuideStep.update({
      where: { id: req.params.id },
      data: {
        ...(category !== undefined && { category }),
        ...(stepNumber !== undefined && { stepNumber }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(imagePublicId !== undefined && { imagePublicId }),
      },
    });
    res.json({ message: "Guide step updated", step });
  } catch (err) {
    console.error("Update guide step error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a guide step (also removes image from Cloudinary)
router.delete("/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const step = await prisma.userGuideStep.findUnique({ where: { id: req.params.id } });
    if (!step) return res.status(404).json({ error: "Guide step not found" });

    if (step.imagePublicId) {
      try {
        await cloudinary.v2.uploader.destroy(step.imagePublicId);
      } catch (e) {
        console.warn("Failed to delete image from Cloudinary:", e.message);
      }
    }

    await prisma.userGuideStep.delete({ where: { id: req.params.id } });
    res.json({ message: "Guide step deleted" });
  } catch (err) {
    console.error("Delete guide step error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reorder steps within a category
router.put("/reorder/:category", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { steps } = req.body; // array of { id, stepNumber }
    if (!Array.isArray(steps)) return res.status(400).json({ error: "steps array required" });

    await Promise.all(
      steps.map(({ id, stepNumber }) =>
        prisma.userGuideStep.update({ where: { id }, data: { stepNumber } })
      )
    );
    res.json({ message: "Steps reordered" });
  } catch (err) {
    console.error("Reorder guide steps error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
