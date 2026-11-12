# Testing Guide: Uncategorized Products Feature

## Quick Test Workflow

### Step 1: Prepare Test Data
Create a CSV/Excel file with the following structure (you can test via the import UI):

```
Product Name | Selling Price | Cost Price | Stock Quantity | Item Type | Category (optional)
Widget A     | 100          | 50         | 10             | product   | (leave blank)
Gadget B     | 200          | 100        | 5              | product   | NonExistentCat
```

### Step 2: Import Products
1. Go to **Inventory** → **Add Product** (or use bulk import)
2. Upload the CSV file from Step 1
3. **Expected Result**: Import succeeds ✅
   - Previously would have failed with "Category is required" error
   - Now both products are imported

### Step 3: Verify Uncategorized Flag in Inventory
1. Navigate to **Inventory**
2. Click **"Show Uncategorized"** filter button (appears in search bar)
3. **Expected Result**: Only your imported products appear with yellow "Uncategorized" badge
4. You can see in the "Status" column that they're marked as uncategorized

### Step 4: Test Sales/POS Behavior
1. Navigate to **Sales**
2. Search for the imported products (e.g., "Widget A")
3. **Expected Result**: 
   - Product card has yellow background
   - Shows **"Uncategorized"** badge
   - "Add to Cart" button is disabled and grayed out
   - Helpful text: "This product needs to be categorized before adding to cart. Edit in inventory."

### Step 5: Categorize Product
1. Go back to **Inventory**
2. Click the **"Edit"** button on an uncategorized product
3. In the edit form, select a category from the "Category" dropdown
4. Save the product
5. **Expected Result**: Product is now categorized

### Step 6: Verify Post-Categorization
1. Go back to **Sales**
2. Find the previously uncategorized product
3. **Expected Result**:
   - No yellow background
   - No "Uncategorized" badge
   - "Add to Cart" button is enabled and clickable
   - Product can now be added to cart normally

## Technical Details

### Database Schema
```sql
-- New field in products table:
isUncategorized BOOLEAN DEFAULT false
categoryId STRING NULLABLE

-- Products can have:
-- categoryId = null AND isUncategorized = true  (needs categorization)
-- categoryId = null AND isUncategorized = false (should not happen)
-- categoryId = valid AND isUncategorized = false (normal, categorized)
```

### Import Logic
When processing each import row:
```javascript
if (!categoryName || !categoryMap.has(categoryName)) {
  // Mark as uncategorized instead of rejecting
  categoryId = null
  isUncategorized = true
}
```

### Frontend Rendering
- **SalesPage.tsx**: Checks `isUncategorized` flag, disables cart button
- **InventoryPage.tsx**: 
  - Shows uncategorized badge in Status column
  - Filters with "Show Uncategorized" button
  - Allows bulk editing of uncategorized products

## Rollback (if needed)

If you need to revert:
```sql
-- Reset all uncategorized flags (if categories weren't assigned)
UPDATE products SET isUncategorized = false WHERE tenantId = '...';

-- Or specifically roll back to requiring categories:
-- Modify inventory.js import validation to add back the requirement
```

## Success Criteria ✅

- [ ] Import succeeds without category
- [ ] Imported products show "Uncategorized" badge in inventory
- [ ] "Show Uncategorized" filter displays only uncategorized items
- [ ] Sales page shows warning badge and disabled cart button
- [ ] Products can be edited and categorized
- [ ] After categorization, cart button works normally
