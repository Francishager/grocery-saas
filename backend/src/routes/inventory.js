import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission, requireFeature } from "../../middleware/auth.js";
import {
  handleBranchError,
  resolveBranchScope,
  scopedWhere,
  tenantIdFromUser,
} from "../utils/branchAccess.js";
import { checkUsageLimit } from "../utils/usageLimits.js";

const router = Router();

// Check the correct permission based on itemType in the request body
function requireItemTypePermission(action) {
  const permMap = {
    create: { product: 'canCreateProduct', service: 'canCreateService', rental: 'canCreateRental' },
    edit:   { product: 'canEditProduct',   service: 'canEditService',   rental: 'canEditRental' },
    delete: { product: 'canDeleteProduct', service: 'canDeleteService', rental: 'canDeleteRental' },
  };
  return (req, res, next) => {
    const itemType = req.body?.itemType || 'product';
    const perm = permMap[action]?.[itemType] || permMap[action]?.product;
    if (!perm) return res.status(403).json({ error: 'Permission denied' });
    // Reuse requirePermission logic
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(perm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${perm} required` });
    }
    next();
  };
}

const DEFAULT_CATEGORIES = [
  // Product categories
  { name: "Electrical Supplies", slug: "electrical-supplies", categoryType: "product" },
  { name: "Electric Cables & Wires", slug: "electric-cables-wires", categoryType: "product" },
  { name: "Switches & Sockets", slug: "switches-sockets", categoryType: "product" },
  { name: "Circuit Breakers", slug: "circuit-breakers", categoryType: "product" },
  { name: "Lighting & Bulbs", slug: "lighting-bulbs", categoryType: "product" },
  { name: "Mobile Phones", slug: "mobile-phones", categoryType: "product" },
  { name: "Mobile Accessories", slug: "mobile-accessories", categoryType: "product" },
  { name: "Phone Chargers", slug: "phone-chargers", categoryType: "product" },
  { name: "Power Banks", slug: "power-banks", categoryType: "product" },
  { name: "Earphones & Headsets", slug: "earphones-headsets", categoryType: "product" },
  { name: "Phone Cases", slug: "phone-cases", categoryType: "product" },
  { name: "Screen Protectors", slug: "screen-protectors", categoryType: "product" },
  { name: "Hardware Tools", slug: "hardware-tools", categoryType: "product" },
  { name: "Nails & Screws", slug: "nails-screws", categoryType: "product" },
  { name: "Plumbing Accessories", slug: "plumbing-accessories", categoryType: "product" },
  { name: "Building Hardware", slug: "building-hardware", categoryType: "product" },
  { name: "General Merchandise", slug: "general-merchandise", categoryType: "product" },
  { name: "Wholesale Goods", slug: "wholesale-goods", categoryType: "product" },
  { name: "Supermarket Essentials", slug: "supermarket-essentials", categoryType: "product" },
  { name: "Groceries", slug: "groceries", categoryType: "product" },
  { name: "Beverages", slug: "beverages", categoryType: "product" },
  { name: "Dairy Products", slug: "dairy-products", categoryType: "product" },
  { name: "Bakery", slug: "bakery", categoryType: "product" },
  { name: "Snacks", slug: "snacks", categoryType: "product" },
  { name: "Confectionery", slug: "confectionery", categoryType: "product" },
  { name: "Fruits", slug: "fruits", categoryType: "product" },
  { name: "Vegetables", slug: "vegetables", categoryType: "product" },
  { name: "Meat & Poultry", slug: "meat-poultry", categoryType: "product" },
  { name: "Frozen Foods", slug: "frozen-foods", categoryType: "product" },
  { name: "Household Items", slug: "household-items", categoryType: "product" },
  { name: "Personal Care", slug: "personal-care", categoryType: "product" },
  { name: "Baby Products", slug: "baby-products", categoryType: "product" },
  { name: "Cleaning Supplies", slug: "cleaning-supplies", categoryType: "product" },
  { name: "Laundry Products", slug: "laundry-products", categoryType: "product" },
  { name: "Stationery", slug: "stationery", categoryType: "product" },
  { name: "Books", slug: "books", categoryType: "product" },
  { name: "Office Supplies", slug: "office-supplies", categoryType: "product" },
  { name: "Hardware", slug: "hardware", categoryType: "product" },
  { name: "Building Materials", slug: "building-materials", categoryType: "product" },
  { name: "Paints", slug: "paints", categoryType: "product" },
  { name: "Plumbing", slug: "plumbing", categoryType: "product" },
  { name: "Electrical", slug: "electrical", categoryType: "product" },
  { name: "Electronics", slug: "electronics", categoryType: "product" },
  { name: "Phone Accessories", slug: "phone-accessories", categoryType: "product" },
  { name: "Computers", slug: "computers", categoryType: "product" },
  { name: "Printers", slug: "printers", categoryType: "product" },
  { name: "Cosmetics", slug: "cosmetics", categoryType: "product" },
  { name: "Beauty Products", slug: "beauty-products", categoryType: "product" },
  { name: "Salon Supplies", slug: "salon-supplies", categoryType: "product" },
  { name: "Pharmaceuticals", slug: "pharmaceuticals", categoryType: "product" },
  { name: "Medical Supplies", slug: "medical-supplies", categoryType: "product" },
  { name: "Clothing", slug: "clothing", categoryType: "product" },
  { name: "Shoes", slug: "shoes", categoryType: "product" },
  { name: "Bags", slug: "bags", categoryType: "product" },
  { name: "Fashion Accessories", slug: "fashion-accessories", categoryType: "product" },
  { name: "Jewelry", slug: "jewelry", categoryType: "product" },
  { name: "Home Appliances", slug: "home-appliances", categoryType: "product" },
  { name: "Kitchenware", slug: "kitchenware", categoryType: "product" },
  { name: "Furniture", slug: "furniture", categoryType: "product" },
  { name: "Bedding", slug: "bedding", categoryType: "product" },
  { name: "Pet Supplies", slug: "pet-supplies", categoryType: "product" },
  { name: "Agricultural Inputs", slug: "agricultural-inputs", categoryType: "product" },
  { name: "Seeds", slug: "seeds", categoryType: "product" },
  { name: "Animal Feeds", slug: "animal-feeds", categoryType: "product" },
  { name: "Restaurant Supplies", slug: "restaurant-supplies", categoryType: "product" },
  { name: "Liquor & Wines", slug: "liquor-wines", categoryType: "product" },
  { name: "Water", slug: "water", categoryType: "product" },
  { name: "Industrial Supplies", slug: "industrial-supplies", categoryType: "product" },
  { name: "Spare Parts", slug: "spare-parts", categoryType: "product" },
  { name: "Other", slug: "other", categoryType: "product" },
  // Service categories
  { name: "IT Services", slug: "it-services", categoryType: "service" },
  { name: "Web Development", slug: "web-development", categoryType: "service" },
  { name: "Graphic Design", slug: "graphic-design", categoryType: "service" },
  { name: "Legal Services", slug: "legal-services", categoryType: "service" },
  { name: "Accounting Services", slug: "accounting-services", categoryType: "service" },
  { name: "Consulting", slug: "consulting", categoryType: "service" },
  { name: "Cleaning Services", slug: "cleaning-services", categoryType: "service" },
  { name: "Repairs & Maintenance", slug: "repairs-maintenance", categoryType: "service" },
  { name: "Beauty & Salon", slug: "beauty-salon", categoryType: "service" },
  { name: "Barbershop", slug: "barbershop", categoryType: "service" },
  { name: "Bride & Groom", slug: "bride-groom", categoryType: "service" },
  { name: "Spa & Wellness", slug: "spa-wellness", categoryType: "service" },
  { name: "Transport Services", slug: "transport-services", categoryType: "service" },
  { name: "Marketing Services", slug: "marketing-services", categoryType: "service" },
  { name: "Printing & Photocopy", slug: "printing-photocopy", categoryType: "service" },
  { name: "Photography & Videography", slug: "photography-videography", categoryType: "service" },
  { name: "Catering Services", slug: "catering-services", categoryType: "service" },
  { name: "Event Planning", slug: "event-planning", categoryType: "service" },
  { name: "Training & Coaching", slug: "training-coaching", categoryType: "service" },
  { name: "Healthcare Services", slug: "healthcare-services", categoryType: "service" },
  { name: "Real Estate Services", slug: "real-estate-services", categoryType: "service" },
  { name: "Insurance Services", slug: "insurance-services", categoryType: "service" },
  { name: "Security Services", slug: "security-services", categoryType: "service" },
  { name: "Courier & Delivery", slug: "courier-delivery", categoryType: "service" },
  { name: "Installation Services", slug: "installation-services", categoryType: "service" },
  { name: "Support Contracts", slug: "support-contracts", categoryType: "service" },
  { name: "Maintenance Plans", slug: "maintenance-plans", categoryType: "service" },
  { name: "Other Services", slug: "other-services", categoryType: "service" },
  // More service categories
  { name: "Laundry & Dry Cleaning", slug: "laundry-dry-cleaning", categoryType: "service" },
  { name: "Tailoring & Alterations", slug: "tailoring-alterations", categoryType: "service" },
  { name: "Car Wash & Valet", slug: "car-wash-valet", categoryType: "service" },
  { name: "Auto Repair Services", slug: "auto-repair-services", categoryType: "service" },
  { name: "Electrician Services", slug: "electrician-services", categoryType: "service" },
  { name: "Plumbing Services", slug: "plumbing-services", categoryType: "service" },
  { name: "Carpentry Services", slug: "carpentry-services", categoryType: "service" },
  { name: "Masonry Services", slug: "masonry-services", categoryType: "service" },
  { name: "Roofing Services", slug: "roofing-services", categoryType: "service" },
  { name: "Painting Services", slug: "painting-services", categoryType: "service" },
  { name: "Landscaping & Gardening", slug: "landscaping-gardening", categoryType: "service" },
  { name: "Pest Control", slug: "pest-control", categoryType: "service" },
  { name: "Moving & Relocation", slug: "moving-relocation", categoryType: "service" },
  { name: "Storage Services", slug: "storage-services", categoryType: "service" },
  { name: "Tutoring & Education", slug: "tutoring-education", categoryType: "service" },
  { name: "Music Lessons", slug: "music-lessons", categoryType: "service" },
  { name: "Fitness & Personal Training", slug: "fitness-personal-training", categoryType: "service" },
  { name: "Yoga & Meditation", slug: "yoga-meditation", categoryType: "service" },
  { name: "Massage Therapy", slug: "massage-therapy", categoryType: "service" },
  { name: "Nail Services", slug: "nail-services", categoryType: "service" },
  { name: "Hairdressing", slug: "hairdressing", categoryType: "service" },
  { name: "Makeup Services", slug: "makeup-services", categoryType: "service" },
  { name: "Event Decor", slug: "event-decor", categoryType: "service" },
  { name: "DJ Services", slug: "dj-services", categoryType: "service" },
  { name: "MC & Hosting", slug: "mc-hosting", categoryType: "service" },
  { name: "Catering & Food Services", slug: "catering-food-services", categoryType: "service" },
  { name: "Bakery Services", slug: "bakery-services", categoryType: "service" },
  { name: "Cooking Classes", slug: "cooking-classes", categoryType: "service" },
  { name: "Translation Services", slug: "translation-services", categoryType: "service" },
  { name: "Writing & Copywriting", slug: "writing-copywriting", categoryType: "service" },
  { name: "Video Editing", slug: "video-editing", categoryType: "service" },
  { name: "Social Media Management", slug: "social-media-management", categoryType: "service" },
  { name: "SEO Services", slug: "seo-services", categoryType: "service" },
  { name: "App Development", slug: "app-development", categoryType: "service" },
  { name: "Software Installation", slug: "software-installation", categoryType: "service" },
  { name: "Computer Repair", slug: "computer-repair", categoryType: "service" },
  { name: "Phone Repair", slug: "phone-repair", categoryType: "service" },
  { name: "Data Recovery", slug: "data-recovery", categoryType: "service" },
  { name: "Network Setup", slug: "network-setup", categoryType: "service" },
  { name: "Cybersecurity Services", slug: "cybersecurity-services", categoryType: "service" },
  { name: "Bookkeeping", slug: "bookkeeping", categoryType: "service" },
  { name: "Tax Preparation", slug: "tax-preparation", categoryType: "service" },
  { name: "Audit Services", slug: "audit-services", categoryType: "service" },
  { name: "Business Registration", slug: "business-registration", categoryType: "service" },
  { name: "Notary Services", slug: "notary-services", categoryType: "service" },
  { name: "Immigration Services", slug: "immigration-services", categoryType: "service" },
  { name: "Logistics & Freight", slug: "logistics-freight", categoryType: "service" },
  { name: "Customs Clearance", slug: "customs-clearance", categoryType: "service" },
  { name: "Waste Management", slug: "waste-management", categoryType: "service" },
  { name: "Solar Installation", slug: "solar-installation", categoryType: "service" },
  { name: "Generator Servicing", slug: "generator-servicing", categoryType: "service" },
  { name: "AC & Refrigeration", slug: "ac-refrigeration", categoryType: "service" },
  { name: "Interior Design", slug: "interior-design", categoryType: "service" },
  { name: "Architecture Services", slug: "architecture-services", categoryType: "service" },
  { name: "Surveying Services", slug: "surveying-services", categoryType: "service" },
  { name: "Veterinary Services", slug: "veterinary-services", categoryType: "service" },
  { name: "Laboratory Services", slug: "laboratory-services", categoryType: "service" },
  { name: "Ambulance Services", slug: "ambulance-services", categoryType: "service" },
  { name: "Home Nursing", slug: "home-nursing", categoryType: "service" },
  { name: "Counseling Services", slug: "counseling-services", categoryType: "service" },
  { name: "Childcare Services", slug: "childcare-services", categoryType: "service" },
  { name: "Elderly Care", slug: "elderly-care", categoryType: "service" },
  { name: "Housekeeping", slug: "housekeeping", categoryType: "service" },
  { name: "Pool Cleaning", slug: "pool-cleaning", categoryType: "service" },
  { name: "Fumigation Services", slug: "fumigation-services", categoryType: "service" },
  { name: "Equipment Servicing", slug: "equipment-servicing", categoryType: "service" },
  { name: "Welding Services", slug: "welding-services", categoryType: "service" },
  { name: "Fabrication Services", slug: "fabrication-services", categoryType: "service" },
  { name: "Engraving Services", slug: "engraving-services", categoryType: "service" },
  { name: "3D Printing Services", slug: "3d-printing-services", categoryType: "service" },
  { name: "Photocopy & Scanning", slug: "photocopy-scanning", categoryType: "service" },
  { name: "Document Certification", slug: "document-certification", categoryType: "service" },
  { name: "Visa Processing", slug: "visa-processing", categoryType: "service" },
  { name: "Ticketing & Travel", slug: "ticketing-travel", categoryType: "service" },
  { name: "Tour Guide Services", slug: "tour-guide-services", categoryType: "service" },
  { name: "Hotel Booking Services", slug: "hotel-booking-services", categoryType: "service" },
  // Rental categories
  { name: "Wedding & Bridal Rentals", slug: "wedding-bridal-rentals", categoryType: "rental" },
  { name: "Bride & Groom Attire", slug: "bride-groom-attire", categoryType: "rental" },
  { name: "Wedding Decor Rentals", slug: "wedding-decor-rentals", categoryType: "rental" },
  { name: "Event Tent Rentals", slug: "event-tent-rentals", categoryType: "rental" },
  { name: "Tables & Chairs Rentals", slug: "tables-chairs-rentals", categoryType: "rental" },
  { name: "Sound System Rentals", slug: "sound-system-rentals", categoryType: "rental" },
  { name: "Lighting Equipment Rentals", slug: "lighting-equipment-rentals", categoryType: "rental" },
  { name: "Generator Rentals", slug: "generator-rentals", categoryType: "rental" },
  { name: "Construction Equipment Rentals", slug: "construction-equipment-rentals", categoryType: "rental" },
  { name: "Power Tools Rentals", slug: "power-tools-rentals", categoryType: "rental" },
  { name: "Heavy Machinery Rentals", slug: "heavy-machinery-rentals", categoryType: "rental" },
  { name: "Scaffolding Rentals", slug: "scaffolding-rentals", categoryType: "rental" },
  { name: "Ladder Rentals", slug: "ladder-rentals", categoryType: "rental" },
  { name: "Vehicle Rentals", slug: "vehicle-rentals", categoryType: "rental" },
  { name: "Car Rentals", slug: "car-rentals", categoryType: "rental" },
  { name: "Truck Rentals", slug: "truck-rentals", categoryType: "rental" },
  { name: "Motorcycle Rentals", slug: "motorcycle-rentals", categoryType: "rental" },
  { name: "Bicycle Rentals", slug: "bicycle-rentals", categoryType: "rental" },
  { name: "Boat Rentals", slug: "boat-rentals", categoryType: "rental" },
  { name: "Camera & Photography Rentals", slug: "camera-photography-rentals", categoryType: "rental" },
  { name: "Video Equipment Rentals", slug: "video-equipment-rentals", categoryType: "rental" },
  { name: "Audio Equipment Rentals", slug: "audio-equipment-rentals", categoryType: "rental" },
  { name: "DJ Equipment Rentals", slug: "dj-equipment-rentals", categoryType: "rental" },
  { name: "Stage & Platform Rentals", slug: "stage-platform-rentals", categoryType: "rental" },
  { name: "Party Supplies Rentals", slug: "party-supplies-rentals", categoryType: "rental" },
  { name: "Furniture Rentals", slug: "furniture-rentals", categoryType: "rental" },
  { name: "Office Equipment Rentals", slug: "office-equipment-rentals", categoryType: "rental" },
  { name: "Computer & Laptop Rentals", slug: "computer-laptop-rentals", categoryType: "rental" },
  { name: "Printer Rentals", slug: "printer-rentals", categoryType: "rental" },
  { name: "Projector Rentals", slug: "projector-rentals", categoryType: "rental" },
  { name: "TV & Display Rentals", slug: "tv-display-rentals", categoryType: "rental" },
  { name: "Gaming Equipment Rentals", slug: "gaming-equipment-rentals", categoryType: "rental" },
  { name: "Sports Equipment Rentals", slug: "sports-equipment-rentals", categoryType: "rental" },
  { name: "Camping Gear Rentals", slug: "camping-gear-rentals", categoryType: "rental" },
  { name: "Outdoor Equipment Rentals", slug: "outdoor-equipment-rentals", categoryType: "rental" },
  { name: "Costume Rentals", slug: "costume-rentals", categoryType: "rental" },
  { name: "Formal Wear Rentals", slug: "formal-wear-rentals", categoryType: "rental" },
  { name: "Suit & Tuxedo Rentals", slug: "suit-tuxedo-rentals", categoryType: "rental" },
  { name: "Gown Rentals", slug: "gown-rentals", categoryType: "rental" },
  { name: "Jewelry Rentals", slug: "jewelry-rentals", categoryType: "rental" },
  { name: "Linens & Bedding Rentals", slug: "linens-bedding-rentals", categoryType: "rental" },
  { name: "Tableware Rentals", slug: "tableware-rentals", categoryType: "rental" },
  { name: "Kitchen Equipment Rentals", slug: "kitchen-equipment-rentals", categoryType: "rental" },
  { name: "Cooler & Fridge Rentals", slug: "cooler-fridge-rentals", categoryType: "rental" },
  { name: "Industrial Equipment Rentals", slug: "industrial-equipment-rentals", categoryType: "rental" },
  { name: "Medical Equipment Rentals", slug: "medical-equipment-rentals", categoryType: "rental" },
  { name: "Wheelchair Rentals", slug: "wheelchair-rentals", categoryType: "rental" },
  { name: "Baby Equipment Rentals", slug: "baby-equipment-rentals", categoryType: "rental" },
  { name: "Bounce House Rentals", slug: "bounce-house-rentals", categoryType: "rental" },
  { name: "Inflatable Rentals", slug: "inflatable-rentals", categoryType: "rental" },
  { name: "Catering Equipment Rentals", slug: "catering-equipment-rentals", categoryType: "rental" },
  { name: "Storage Container Rentals", slug: "storage-container-rentals", categoryType: "rental" },
  { name: "Waste Bin Rentals", slug: "waste-bin-rentals", categoryType: "rental" },
  { name: "Security Equipment Rentals", slug: "security-equipment-rentals", categoryType: "rental" },
  { name: "Telecom Equipment Rentals", slug: "telecom-equipment-rentals", categoryType: "rental" },
  { name: "Other Rentals", slug: "other-rentals", categoryType: "rental" },
];

const slugify = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalizeProductName = (value = "") => String(value).trim().replace(/\s+/g, " ");

const buildSkuBase = (name = "") => {
  const slug = slugify(name) || "item";
  const letters = (slug.match(/[a-z]+/gi) || ["item"]).join("").toUpperCase();
  const firstPart = letters.slice(0, 3).padEnd(3, "X");
  const secondPart = letters.slice(3, 5).padEnd(2, "X");
  return `${firstPart}-${secondPart}`;
};

async function resolveUniqueSku(prisma, tenantId, branchId, name, itemType = "product", excludeId = null, reserved = new Set()) {
  const baseSku = buildSkuBase(name);
  let candidate = `${baseSku}-0`;
  let counter = 1;

  while (true) {
    if (reserved.has(candidate)) {
      candidate = `${baseSku}-${counter}`;
      counter += 1;
      continue;
    }

    const existing = await prisma.product.findFirst({
      where: {
        tenantId,
        branchId,
        sku: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      reserved.add(candidate);
      return candidate;
    }

    candidate = `${baseSku}-${counter}`;
    counter += 1;
  }
}

async function ensureUniqueProductName(prisma, tenantId, branchId, name, excludeId = null) {
  const normalizedName = normalizeProductName(name);
  if (!normalizedName) return { ok: false, error: "Product name is required" };

  const existing = await prisma.product.findFirst({
    where: {
      tenantId,
      branchId,
      name: { equals: normalizedName, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (existing) {
    return { ok: false, error: `Product name "${normalizedName}" already exists` };
  }

  return { ok: true, name: normalizedName };
}

async function ensureTenantCategories(tenantId) {
  if (!tenantId) return;

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      tenantId,
    })),
    skipDuplicates: true,
  });
}

// List products
router.get("/", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const tenantId = scope.tenantId;
    const { search, category, page = 1, limit = 100, lowStock, barcode, itemType } = req.query;
    const where = scopedWhere(scope, { isActive: { not: false } });

    // Filter by itemType if provided
    if (itemType) where.itemType = String(itemType);

    // Barcode exact lookup (highest priority)
    if (barcode) {
      const product = await prisma.product.findFirst({
        where: scopedWhere(scope, { barcode, isActive: { not: false } }),
        include: { category: true, branch: true },
      });
      return res.json({ products: product ? [product] : [], total: product ? 1 : 0, page: 1, limit: 1 });
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
        { barcode: { contains: String(search), mode: "insensitive" } },
        { description: { contains: String(search), mode: "insensitive" } },
      ];
      const products = await prisma.product.findMany({
        where,
        include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
        orderBy: { name: "asc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });
      const total = await prisma.product.count({ where });
      return res.json({ products, total, page: Number(page), limit: Number(limit) });
    }

    if (category) where.categoryId = category;
    if (lowStock === "true") where.quantity = { lte: 10 };

    const products = await prisma.product.findMany({
      where: { ...where, isActive: { not: false } },
      include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
      orderBy: { name: "asc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.product.count({ where });
    res.json({ products, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List inventory error:", err);
    handleBranchError(res, err);
  }
});

// Categories
router.get("/categories", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    await ensureTenantCategories(tenantId);
    const { type } = req.query;
    const where = { tenantId };
    if (type) where.categoryType = String(type);
    const categories = await prisma.category.findMany({ where, orderBy: { name: "asc" } });
    res.json(categories);
  } catch (err) {
    console.error("List categories error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/categories", authenticateToken, requirePermission("canCreateProduct"), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name is required" });

    const slug = slugify(req.body?.slug || name);
    const categoryType = ["service", "rental"].includes(req.body?.categoryType) ? req.body.categoryType : "product";
    const category = await prisma.category.create({ data: { name, slug, tenantId, categoryType } });
    res.status(201).json({ message: "Category created", category });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Category already exists" });
    console.error("Create category error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single product
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: { category: true, branch: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    handleBranchError(res, err);
  }
});

// Create product
router.post("/", authenticateToken, requireItemTypePermission('create'), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const { tenantId: _tenantId, branchId: _branchId, id: _id, categoryId, itemType, ...body } = req.body;

    const normalizedName = normalizeProductName(body.name);
    if (!normalizedName) {
      return res.status(400).json({ error: "Product name is required" });
    }
    if (body.price === undefined || body.price === null || Number(body.price) <= 0) {
      return res.status(400).json({ error: "Selling price must be greater than 0" });
    }

    // Set itemType (default to product, allow rental)
    const itemTypeValue = ["service", "rental"].includes(itemType) ? itemType : "product";
    body.itemType = itemTypeValue;

    const duplicateCheck = await ensureUniqueProductName(prisma, scope.tenantId, scope.branchId, normalizedName);
    if (!duplicateCheck.ok) {
      return res.status(409).json({ error: duplicateCheck.error });
    }
    body.name = duplicateCheck.name;
    body.sku = await resolveUniqueSku(prisma, scope.tenantId, scope.branchId, duplicateCheck.name, itemTypeValue);

    // For service items, zero out inventory fields
    if (itemTypeValue === "service") {
      body.quantity = 0;
      body.minStock = 0;
      body.cost = null;
      body.barcode = null;
      body.sku = body.sku || null;
      body.baseUnit = "Service";
    }
    // For rental items, keep stock tracking but set defaults
    if (itemTypeValue === "rental") {
      body.rentalPrice = body.rentalPrice || body.price || 0;
      body.rentalPeriod = body.rentalPeriod || "daily";
      body.depositAmount = body.depositAmount || 0;
      body.replacementValue = body.replacementValue || 0;
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: scope.tenantId },
        select: { id: true },
      });
      if (!category) return res.status(400).json({ error: "Category not found" });
    }

    await checkUsageLimit(scope.tenantId, 'products');

    const product = await prisma.product.create({
      data: { ...body, categoryId: categoryId || null, tenantId: scope.tenantId, branchId: scope.branchId },
      include: { category: true, branch: true, units: true },
    });
    res.status(201).json({ message: "Product created", product });
  } catch (err) {
    if (err?.code === 'LIMIT_REACHED') return res.status(403).json({ error: err.message });
    console.error("Create product error:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Update product
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const existing = await prisma.product.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
    });
    if (!existing) return res.status(404).json({ error: "Product not found" });

    // Check permission based on the existing item's type
    const existingType = existing.itemType || 'product';
    const editPermMap = { product: 'canEditProduct', service: 'canEditService', rental: 'canEditRental' };
    const requiredPerm = editPermMap[existingType] || 'canEditProduct';
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(requiredPerm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${requiredPerm} required` });
    }

    const { tenantId: _tenantId, branchId, id: _id, categoryId, itemType, ...body } = req.body;
    const data = { ...body };

    if (body.name !== undefined) {
      const normalizedName = normalizeProductName(body.name);
      if (!normalizedName) return res.status(400).json({ error: "Product name is required" });
      const duplicateCheck = await ensureUniqueProductName(prisma, existing.tenantId, existing.branchId || scope.branchId, normalizedName, existing.id);
      if (!duplicateCheck.ok) return res.status(409).json({ error: duplicateCheck.error });
      data.name = duplicateCheck.name;
      data.sku = await resolveUniqueSku(prisma, existing.tenantId, existing.branchId || scope.branchId, duplicateCheck.name, existing.itemType || 'product', existing.id);
    }

    // Handle itemType update
    if (itemType === "service") {
      data.itemType = "service";
      data.quantity = 0;
      data.minStock = 0;
      data.cost = null;
      data.baseUnit = "Service";
    } else if (itemType === "product") {
      data.itemType = "product";
    } else if (itemType === "rental") {
      data.itemType = "rental";
    }

    if (categoryId !== undefined) {
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, tenantId: existing.tenantId },
          select: { id: true },
        });
        if (!category) return res.status(400).json({ error: "Category not found" });
      }
      data.categoryId = categoryId || null;
    }

    if (branchId !== undefined) {
      const targetScope = await resolveBranchScope(prisma, { ...req, body: { branchId } }, {
        source: "body",
        requireBranch: true,
        allowOwnerAll: false,
      });
      data.branchId = targetScope.branchId;
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
      include: { category: true, branch: true, units: { orderBy: { conversionFactor: "asc" } } },
    });
    res.json({ message: "Product updated", product });
  } catch (err) {
    console.error("Update product error:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "SKU or barcode already exists in this branch" });
    handleBranchError(res, err);
  }
});

// Delete product
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.id }) });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Check permission based on the item's type
    const itemType = product.itemType || 'product';
    const deletePermMap = { product: 'canDeleteProduct', service: 'canDeleteService', rental: 'canDeleteRental' };
    const requiredPerm = deletePermMap[itemType] || 'canDeleteProduct';
    const userPerms = req.user?.permissions || [];
    if (!userPerms.includes(requiredPerm) && !userPerms.includes('*')) {
      return res.status(403).json({ error: `Permission denied: ${requiredPerm} required` });
    }

    await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    res.json({ message: "Product deactivated" });
  } catch (err) {
    handleBranchError(res, err);
  }
});

// ==================== PRODUCT UNITS (Multi-UOM) ====================

// Get units for a product
router.get("/:productId/units", authenticateToken, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const units = await prisma.productUnit.findMany({ where: { productId: product.id }, orderBy: { conversionFactor: "asc" } });
    res.json({ units, baseUnit: product.baseUnit });
  } catch (err) { handleBranchError(res, err); }
});

// Add a selling unit to a product
router.post("/:productId/units", authenticateToken, requirePermission("canCreateProduct"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const product = await prisma.product.findFirst({ where: scopedWhere(scope, { id: req.params.productId }) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    if (!unitName || conversionFactor == null || sellingPrice == null) return res.status(400).json({ error: "unitName, conversionFactor, and sellingPrice are required" });
    const unit = await prisma.productUnit.create({ data: { productId: product.id, unitName, conversionFactor: parseFloat(conversionFactor), sellingPrice: parseFloat(sellingPrice), isDefault: isDefault || false } });
    res.status(201).json(unit);
  } catch (err) { handleBranchError(res, err); }
});

// Update a selling unit
router.put("/:productId/units/:unitId", authenticateToken, requirePermission("canEditProduct"), async (req, res) => {
  try {
    const { unitName, conversionFactor, sellingPrice, isDefault } = req.body;
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    const updated = await prisma.productUnit.update({ where: { id: unit.id }, data: { ...(unitName && { unitName }), ...(conversionFactor != null && { conversionFactor: parseFloat(conversionFactor) }), ...(sellingPrice != null && { sellingPrice: parseFloat(sellingPrice) }), ...(isDefault != null && { isDefault }) } });
    res.json(updated);
  } catch (err) { handleBranchError(res, err); }
});

// Delete a selling unit
router.delete("/:productId/units/:unitId", authenticateToken, requirePermission("canEditProduct"), async (req, res) => {
  try {
    const unit = await prisma.productUnit.findUnique({ where: { id: req.params.unitId } });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    await prisma.productUnit.delete({ where: { id: unit.id } });
    res.json({ message: "Unit deleted" });
  } catch (err) { handleBranchError(res, err); }
});

// =====================================================
// Bulk Import Inventory from Excel data
// Frontend parses the Excel file and sends JSON rows.
// Backend validates each row and returns detailed errors.
// =====================================================
router.post("/import", authenticateToken, requirePermission("canImportInventory"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });

    const { rows, branchId } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data rows provided" });
    }

    // Fetch existing categories for this tenant to map by name
    const existingCategories = await prisma.category.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(existingCategories.map(c => [c.name.toLowerCase(), c.id]));

    // Fetch existing names and barcodes for duplicate check
    const existingProducts = await prisma.product.findMany({
      where: { tenantId: scope.tenantId, branchId: scope.branchId },
      select: { name: true, barcode: true },
    });
    const existingNames = new Set(existingProducts.map(p => normalizeProductName(p.name).toLowerCase()).filter(Boolean));
    const existingBarcodes = new Set(existingProducts.map(p => p.barcode).filter(Boolean));

    const errors = [];
    const validRows = [];
    const seenNames = new Set();
    const seenBarcodes = new Set();
    const reservedSkus = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is the header in Excel
      const rowErrors = [];

      // Required: name
      const name = normalizeProductName(String(row.name || row["Product Name"] || ""));
      if (!name) rowErrors.push("Product Name is required");

      // Required: selling price
      const price = parseFloat(row.price || row["Selling Price"]);
      if (isNaN(price) || price <= 0) rowErrors.push("Selling Price must be a number greater than 0");

      // Optional but validated: cost price
      const cost = row.cost != null || row["Cost Price"] != null ? parseFloat(row.cost ?? row["Cost Price"]) : null;
      if (cost != null && (isNaN(cost) || cost < 0)) rowErrors.push("Cost Price must be a non-negative number");

      // Optional: quantity
      const quantity = parseInt(row.quantity ?? row["Stock Quantity"] ?? 0, 10);
      if (isNaN(quantity) || quantity < 0) rowErrors.push("Stock Quantity must be a non-negative integer");

      // Optional: minStock
      const minStock = parseInt(row.minStock ?? row["Reorder Level"] ?? 10, 10);
      if (isNaN(minStock) || minStock < 0) rowErrors.push("Reorder Level must be a non-negative integer");

      if (name) {
        const normalizedNameKey = name.toLowerCase();
        if (existingNames.has(normalizedNameKey) || seenNames.has(normalizedNameKey)) {
          rowErrors.push(`Product name "${name}" already exists in this branch`);
        } else {
          seenNames.add(normalizedNameKey);
        }
      }

      // Optional: barcode
      const barcode = String(row.barcode || row["Barcode"] || "").trim() || null;
      if (barcode) {
        if (existingBarcodes.has(barcode) || seenBarcodes.has(barcode)) {
          rowErrors.push(`Barcode "${barcode}" already exists in this branch`);
        } else {
          seenBarcodes.add(barcode);
        }
      }

      // Optional: category (match by name)
      const categoryName = String(row.category || row["Category"] || "").trim();
      let categoryId = null;
      if (categoryName) {
        categoryId = categoryMap.get(categoryName.toLowerCase());
        if (!categoryId) {
          rowErrors.push(`Category "${categoryName}" not found. Create it first in the inventory page.`);
        }
      }

      // Optional: baseUnit
      const baseUnit = String(row.baseUnit || row["Base Unit"] || "Piece").trim() || "Piece";

      // Optional: description
      const description = String(row.description || row["Description"] || "").trim() || null;

      // Optional: itemType
      const itemType = String(row.itemType || row["Item Type"] || "product").trim().toLowerCase();
      if (!["product", "service", "rental"].includes(itemType)) {
        rowErrors.push(`Item Type must be "product", "service", or "rental" (got "${itemType}")`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, name: name || "(unnamed)", errors: rowErrors });
      } else {
        const generatedSku = await resolveUniqueSku(prisma, scope.tenantId, scope.branchId, name, itemType, null, reservedSkus);
        validRows.push({
          name,
          price,
          cost: cost != null ? cost : null,
          quantity: itemType === "service" ? 0 : quantity,
          minStock: itemType === "service" ? 0 : minStock,
          sku: generatedSku,
          barcode,
          categoryId,
          baseUnit: itemType === "service" ? "Service" : baseUnit,
          description,
          itemType,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          isActive: true,
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed",
        validationErrors: errors,
        validCount: validRows.length,
        errorCount: errors.length,
      });
    }

    // Check usage limit
    await checkUsageLimit(scope.tenantId, 'products');

    // Bulk create
    const created = await prisma.$transaction(
      validRows.map(data => prisma.product.create({ data }))
    );

    res.status(201).json({
      message: `Successfully imported ${created.length} product${created.length !== 1 ? 's' : ''}`,
      imported: created.length,
    });
  } catch (err) {
    if (err?.code === 'LIMIT_REACHED') return res.status(403).json({ error: err.message });
    console.error("Import inventory error:", err);
    res.status(500).json({ error: "Internal server error during import" });
  }
});

export default router;
