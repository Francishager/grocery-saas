const COMMON_PRODUCT_CATEGORIES = [
  { name: 'General Merchandise', slug: 'general-merchandise' },
  { name: 'Household Items', slug: 'household-items' },
  { name: 'Household Plastics', slug: 'household-plastics' },
  { name: 'Food & Grocery', slug: 'food-grocery' },
  { name: 'Cooking Oil', slug: 'cooking-oil' },
  { name: 'Health & Wellness', slug: 'health-wellness' },
  { name: 'Candles & Religious Items', slug: 'candles-religious-items' },
  { name: 'Glassware', slug: 'glassware' },
  { name: 'Other', slug: 'other' },
];

const BUSINESS_TYPE_CATEGORY_MAP = {
  retail: [
    'Groceries',
    'Beverages',
    'Dairy Products',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Fruits',
    'Vegetables',
    'Meat & Poultry',
    'Frozen Foods',
    'Personal Care',
    'Hair Care',
    'Perfumes & Deodorants',
    'Soaps & Body Wash',
    'Laundry & Fabric Care',
    'Baby Products',
    'Cleaning Supplies',
    'Pest Control',
    'Oral Care',
    'Feminine Care',
    'Paper Products',
    'Disposable Products',
    'Stationery & Office Supplies',
    'Footwear & Clothing',
    'Toys & Gifts',
    'Batteries & Electrical',
    'Hardware & Security',
    'Shoe Care',
    'Kitchenware',
  ],
  supermarket: [
    'Wholesale Goods',
    'Groceries',
    'Beverages',
    'Dairy Products',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Fruits',
    'Vegetables',
    'Meat & Poultry',
    'Frozen Foods',
    'Food & Grocery',
    'Cooking Oil',
    'Household Plastics',
    'Cleaning Supplies',
    'Laundry & Fabric Care',
    'Stationery & Office Supplies',
    'Disposable Products',
    'Paper Products',
  ],
  wholesale: [
    'Wholesale Goods',
    'Groceries',
    'Beverages',
    'Dairy Products',
    'Food & Grocery',
    'Cooking Oil',
    'Household Plastics',
    'Cleaning Supplies',
    'Laundry & Fabric Care',
    'Stationery & Office Supplies',
    'Disposable Products',
    'Paper Products',
    'Hardware & Security',
    'Batteries & Electrical',
    'Kitchenware',
  ],
  pharmacy: [
    'Health & Wellness',
    'Personal Care',
    'Hair Care',
    'Perfumes & Deodorants',
    'Soaps & Body Wash',
    'Oral Care',
    'Feminine Care',
    'Baby Products',
    'Medical Supplies',
    'Pharmaceuticals',
    'Beauty Products',
    'Cosmetics',
  ],
  hardware: [
    'Electrical Supplies',
    'Electric Cables & Wires',
    'Switches & Sockets',
    'Circuit Breakers',
    'Lighting & Bulbs',
    'Hardware Tools',
    'Nails & Screws',
    'Plumbing Accessories',
    'Building Hardware',
    'Hardware & Security',
    'Batteries & Electrical',
    'Building Materials',
    'Paints',
    'Plumbing',
    'Electrical',
    'Hardware',
  ],
  restaurant: [
    'Food & Grocery',
    'Beverages',
    'Cooking Oil',
    'Dairy Products',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Kitchenware',
    'Glassware',
    'Disposable Products',
    'Paper Products',
    'Cleaning Supplies',
    'Pest Control',
  ],
  bar: [
    'Beverages',
    'Food & Grocery',
    'Cooking Oil',
    'Snacks',
    'Confectionery',
    'Glassware',
    'Disposable Products',
    'Paper Products',
    'Cleaning Supplies',
  ],
  restaurant_bar: [
    'Beverages',
    'Food & Grocery',
    'Cooking Oil',
    'Dairy Products',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Kitchenware',
    'Glassware',
    'Disposable Products',
    'Paper Products',
    'Cleaning Supplies',
  ],
  cafe: [
    'Beverages',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Food & Grocery',
    'Kitchenware',
    'Glassware',
    'Disposable Products',
    'Paper Products',
  ],
  coffee_shop: [
    'Beverages',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Food & Grocery',
    'Kitchenware',
    'Glassware',
    'Disposable Products',
  ],
  fast_food: [
    'Food & Grocery',
    'Beverages',
    'Cooking Oil',
    'Snacks',
    'Confectionery',
    'Disposable Products',
    'Paper Products',
    'Cleaning Supplies',
  ],
  hotel_restaurant: [
    'Food & Grocery',
    'Beverages',
    'Cooking Oil',
    'Dairy Products',
    'Bakery',
    'Snacks',
    'Confectionery',
    'Kitchenware',
    'Glassware',
    'Disposable Products',
    'Paper Products',
    'Cleaning Supplies',
  ],
  bakery: [
    'Bakery',
    'Beverages',
    'Dairy Products',
    'Snacks',
    'Confectionery',
    'Food & Grocery',
    'Cooking Oil',
    'Kitchenware',
    'Paper Products',
    'Disposable Products',
  ],
  service: [
    'General Merchandise',
    'Household Items',
    'Cleaning Supplies',
    'Office Supplies',
    'Stationery & Office Supplies',
    'Other',
  ],
  salon_spa: [
    'Personal Care',
    'Hair Care',
    'Perfumes & Deodorants',
    'Soaps & Body Wash',
    'Health & Wellness',
    'Beauty Products',
    'Cosmetics',
    'Disposable Products',
    'Paper Products',
    'Cleaning Supplies',
  ],
  repair_shop: [
    'Hardware Tools',
    'Nails & Screws',
    'Plumbing Accessories',
    'Building Hardware',
    'Hardware & Security',
    'Batteries & Electrical',
    'Electrical Supplies',
    'Spare Parts',
    'Mobile Accessories',
    'Phone Chargers',
    'Screen Protectors',
  ],
  manufacturing: [
    'Industrial Supplies',
    'Spare Parts',
    'Hardware Tools',
    'Building Materials',
    'Plumbing Accessories',
    'Electrical Supplies',
    'Hardware & Security',
    'Batteries & Electrical',
  ],
  other: [
    'General Merchandise',
    'Household Items',
    'Food & Grocery',
    'Beverages',
    'Personal Care',
    'Cleaning Supplies',
    'Stationery & Office Supplies',
    'Other',
  ],
};

const slugify = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

const normalizeBusinessType = (businessType = 'other') => {
  const value = String(businessType || 'other').trim().toLowerCase();
  if (BUSINESS_TYPE_CATEGORY_MAP[value]) return value;
  const aliases = {
    retail_store: 'retail',
    shop: 'retail',
    supermarket: 'supermarket',
    wholesale_shop: 'wholesale',
    pharmacy_store: 'pharmacy',
    hardware_store: 'hardware',
    restaurant_bar: 'restaurant_bar',
    cafe_shop: 'cafe',
    coffee: 'coffee_shop',
    fastfood: 'fast_food',
    salon: 'salon_spa',
    spa: 'salon_spa',
    repair: 'repair_shop',
    manufacturing_company: 'manufacturing',
    service_business: 'service',
  };
  return aliases[value] || 'other';
};

const buildCategoryDefinitions = (businessType = 'other') => {
  const normalizedType = normalizeBusinessType(businessType);
  const typeSpecificCategories = BUSINESS_TYPE_CATEGORY_MAP[normalizedType] || BUSINESS_TYPE_CATEGORY_MAP.other;
  const merged = [];
  const seen = new Set();
  const addCategory = (name) => {
    const slug = slugify(name);
    if (!seen.has(slug)) {
      seen.add(slug);
      merged.push({ name, slug, categoryType: 'product' });
    }
  };

  COMMON_PRODUCT_CATEGORIES.forEach((category) => addCategory(category.name));
  typeSpecificCategories.forEach((name) => addCategory(name));

  return merged;
};

export function getDefaultCategoryDefinitionsForBusinessType(businessType = 'other') {
  return buildCategoryDefinitions(businessType);
}

export function getDefaultCategorySlugsForBusinessType(businessType = 'other') {
  return new Set(getDefaultCategoryDefinitionsForBusinessType(businessType).map((category) => category.slug));
}

export function getAllDefaultCategoryDefinitions() {
  const all = [];
  const seen = new Set();
  for (const businessType of Object.keys(BUSINESS_TYPE_CATEGORY_MAP)) {
    for (const category of buildCategoryDefinitions(businessType)) {
      if (!seen.has(category.slug)) {
        seen.add(category.slug);
        all.push(category);
      }
    }
  }
  return all;
}

export function getAllDefaultCategorySlugs() {
  return new Set(getAllDefaultCategoryDefinitions().map((category) => category.slug));
}
