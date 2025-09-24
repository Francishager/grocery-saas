(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  // Helpers
  const $ = (id)=> document.getElementById(id);
  const el = (t, c)=>{ const e = document.createElement(t); if (c) e.className = c; return e; };
  const fmt = (n)=> new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n||0));
  const nowIso = ()=> new Date().toISOString();
  const uid = ()=> Math.random().toString(36).slice(2)+Date.now().toString(36);

  // Business context
  const LS_BIZ = 'stock_business_id';
  function getBiz(){ return ($('stockBizId')?.value?.trim()) || localStorage.getItem(LS_BIZ) || 'default'; }
  function setBiz(b){ localStorage.setItem(LS_BIZ, b || 'default'); const inp = $('stockBizId'); if (inp) inp.value = b; }
  function key(ns){ return `stock:${getBiz()}:${ns}`; }

  // Storage helpers
  function load(ns, def){ try { const j = localStorage.getItem(key(ns)); return j ? JSON.parse(j) : (def ?? []); } catch { return def ?? []; } }
  function save(ns, v){ localStorage.setItem(key(ns), JSON.stringify(v||[])); }
  const getProducts = ()=> load('products');
  const saveProducts = (v)=> save('products', v);
  const getSuppliers = ()=> load('suppliers');
  const saveSuppliers = (v)=> save('suppliers', v);
  const getPurchases = ()=> load('purchases');
  const savePurchases = (v)=> save('purchases', v);
  const getSales = ()=> load('sales');
  const saveSales = (v)=> save('sales', v);
  const getAdjustments = ()=> load('adjustments');
  const saveAdjustments = (v)=> save('adjustments', v);

  // Derived helpers
  function computeStock(product_id){
    const pIn = getPurchases().flatMap(p=> p.lines||[]).filter(l=> l.product_id===product_id).reduce((a,l)=> a + Number(l.qty||0), 0);
    const pOut = getSales().flatMap(s=> s.lines||[]).filter(l=> l.product_id===product_id).reduce((a,l)=> a + Number(l.qty||0), 0);
    const adj = getAdjustments().filter(a=> a.product_id===product_id).reduce((a,x)=> a + Number(x.delta||0), 0);
    return pIn - pOut + adj;
  }
  function lastPurchaseCost(product_id){
    const purchases = getPurchases().slice().reverse();
    for (const p of purchases){ const line = (p.lines||[]).find(l=> l.product_id===product_id); if (line) return Number(line.unit_cost || 0); }
    const prod = getProducts().find(p=> p.id===product_id); return Number(prod?.cost_price||0);
  }
  function uniqueCategories(){ const set = new Set(getProducts().map(p=> p.category||'')); set.delete(''); return Array.from(set).sort(); }

  // ---------- UI Init ----------
  function setupUI(){
    ensureModals();
    // Auto-capture business from current user (fallback to previous/default)
    try {
      const u = (window.App?.Store?.get()?.user) || JSON.parse(localStorage.getItem('user')||'null');
      const autoBiz = u?.business_id || u?.businessId || u?.bizId || null;
      if (autoBiz) setBiz(String(autoBiz));
    } catch {}
    // Apply business context input
    const bizInput = $('stockBizId'); if (bizInput){ bizInput.value = localStorage.getItem(LS_BIZ)||'default'; }
    const applyBtn = $('stockBizApply'); if (applyBtn && !applyBtn._bound){ applyBtn._bound = true; applyBtn.addEventListener('click', ()=>{ setBiz($('stockBizId')?.value?.trim()||'default'); refreshAll(); showToast('Business applied'); }); }
    // Products
    const addProd = $('btnAddProduct'); if (addProd && !addProd._bound){ addProd._bound = true; addProd.addEventListener('click', ()=> openProductModal()); }
    const prodSearch = $('prodSearch'); if (prodSearch && !prodSearch._bound){ prodSearch._bound = true; prodSearch.addEventListener('input', renderProductsTable); }
    const prodCat = $('prodFilterCategory'); if (prodCat && !prodCat._bound){ prodCat._bound = true; prodCat.addEventListener('change', renderProductsTable); }
    // Suppliers
    const addSup = $('btnAddSupplier'); if (addSup && !addSup._bound){ addSup._bound = true; addSup.addEventListener('click', ()=> openSupplierModal()); }
    const supSearch = $('supSearch'); if (supSearch && !supSearch._bound){ supSearch._bound = true; supSearch.addEventListener('input', renderSuppliersTable); }
    // Purchases
    const btnNewPurchase = $('btnNewPurchase'); if (btnNewPurchase && !btnNewPurchase._bound){ btnNewPurchase._bound = true; btnNewPurchase.addEventListener('click', ()=> openPurchaseModal()); }
    // Sales
    const btnRecordSale = $('btnRecordSale'); if (btnRecordSale && !btnRecordSale._bound){ btnRecordSale._bound = true; btnRecordSale.addEventListener('click', ()=> openSaleModal()); }
    // Inventory filters
    const invCat = $('invFilterCategory'); if (invCat && !invCat._bound){ invCat._bound = true; invCat.addEventListener('change', renderInventoryTable); }
    const invStat = $('invFilterStatus'); if (invStat && !invStat._bound){ invStat._bound = true; invStat.addEventListener('change', renderInventoryTable); }
    const adjBtn = $('btnAdjustStock'); if (adjBtn && !adjBtn._bound){ adjBtn._bound = true; adjBtn.addEventListener('click', ()=> openAdjustModal()); }

    refreshAll();
  }

  function refreshAll(){
    // fill category selects
    const cats = uniqueCategories();
    const catSel = $('prodFilterCategory'); if (catSel){ const prev = catSel.value; catSel.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join(''); if (prev) catSel.value = prev; }
    const invCat = $('invFilterCategory'); if (invCat){ const prev = invCat.value; invCat.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join(''); if (prev) invCat.value = prev; }

    renderProductsTable();
    renderSuppliersTable();
    renderPurchasesTable();
    renderSalesTable();
    renderInventoryTable();
  }

  // ---------- Products ----------
  function renderProductsTable(){
    const tbody = $('productsTable'); if (!tbody) return;
    const q = ($('prodSearch')?.value||'').toLowerCase();
    const cat = $('prodFilterCategory')?.value||'';
    const rows = getProducts().filter(p=> !cat || p.category===cat).filter(p=> !q || [p.name, p.sku].some(v=> String(v||'').toLowerCase().includes(q)));
    if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="9" class="text-muted">No products</td></tr>`; return; }
    tbody.innerHTML = rows.map(p=>{
      const stock = computeStock(p.id);
      const status = p.active===false ? 'Inactive' : 'Active';
      return `<tr>
        <td>${p.name||'—'}</td>
        <td>${p.sku||'—'}</td>
        <td>${p.category||'—'}</td>
        <td>${p.unit||'—'}</td>
        <td>${fmt(p.selling_price||0)}</td>
        <td>${fmt(p.cost_price||0)}</td>
        <td>${stock}</td>
        <td>${status}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary" data-edit="${p.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger ms-1" data-del="${p.id}">Delete</button>
        </td>
      </tr>`;
    }).join('');
    // bind actions
    tbody.querySelectorAll('[data-edit]').forEach(btn=> btn.addEventListener('click', (e)=>{ const id = e.currentTarget.getAttribute('data-edit'); const prod = getProducts().find(x=>x.id===id); if (prod) openProductModal(prod); }));
    tbody.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', (e)=>{ const id = e.currentTarget.getAttribute('data-del'); if (!confirm('Delete this product?')) return; const list = getProducts().filter(x=> x.id!==id); saveProducts(list); renderProductsTable(); renderInventoryTable(); showToast('Product deleted'); }));
  }

  function ensureProductModal(){
    if ($('productModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal" id="productModal" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header"><h6 class="modal-title">Product</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <form id="productForm" class="row g-3">
              <input type="hidden" id="prod_id" />
              <div class="col-md-6"><label class="form-label">Product Name</label><input id="prod_name" class="form-control" required /></div>
              <div class="col-md-3"><label class="form-label">SKU/Code</label><input id="prod_sku" class="form-control" /></div>
              <div class="col-md-3"><label class="form-label">Category</label><input id="prod_category" class="form-control" /></div>
              <div class="col-md-3"><label class="form-label">Unit</label><input id="prod_unit" class="form-control" placeholder="pcs, kg" /></div>
              <div class="col-md-3"><label class="form-label">Selling Price</label><input id="prod_sell" type="number" step="0.01" class="form-control" required /></div>
              <div class="col-md-3"><label class="form-label">Cost Price</label><input id="prod_cost" type="number" step="0.01" class="form-control" required /></div>
              <div class="col-md-3"><label class="form-label">Reorder Level</label><input id="prod_reorder" type="number" step="1" class="form-control" value="0" /></div>
              <div class="col-12 form-check ms-1"><input id="prod_active" type="checkbox" class="form-check-input" checked /><label class="form-check-label">Active</label></div>
            </form>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button id="prodSaveBtn" class="btn btn-primary btn-sm">Save</button></div>
        </div></div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    $('prodSaveBtn').addEventListener('click', saveProductModal);
  }

  function openProductModal(prod){ ensureProductModal(); $('prod_id').value = prod?.id||''; $('prod_name').value = prod?.name||''; $('prod_sku').value = prod?.sku||''; $('prod_category').value = prod?.category||''; $('prod_unit').value = prod?.unit||''; $('prod_sell').value = prod?.selling_price||''; $('prod_cost').value = prod?.cost_price||''; $('prod_reorder').value = prod?.reorder_level||0; $('prod_active').checked = (prod?.active!==false); bsModal('productModal')?.show(); }

  function saveProductModal(){
    const id = $('prod_id').value||'';
    const data = {
      id: id || uid(), name: $('prod_name').value?.trim(), sku: $('prod_sku').value?.trim(), category: $('prod_category').value?.trim(), unit: $('prod_unit').value?.trim(), selling_price: Number($('prod_sell').value||0), cost_price: Number($('prod_cost').value||0), reorder_level: Number($('prod_reorder').value||0), active: !!$('prod_active').checked, updated_at: nowIso()
    };
    if (!data.name){ showAlert('Product name is required','danger'); return; }
    const list = getProducts(); const idx = list.findIndex(p=> p.id===data.id);
    if (idx>=0){ const prev = list[idx]; if ((Number(prev.selling_price)||0)!==data.selling_price || (Number(prev.cost_price)||0)!==data.cost_price){ prev.price_history = prev.price_history||[]; prev.price_history.push({ at: nowIso(), selling_price: data.selling_price, cost_price: data.cost_price }); } list[idx] = { ...prev, ...data }; }
    else { data.created_at = nowIso(); data.price_history = [{ at: nowIso(), selling_price: data.selling_price, cost_price: data.cost_price }]; list.push(data); }
    saveProducts(list); bsModal('productModal')?.hide(); renderProductsTable(); renderInventoryTable(); showToast('Product saved');
  }

  // ---------- Suppliers ----------
  function renderSuppliersTable(){
    const tbody = $('suppliersTable'); if (!tbody) return;
    const q = ($('supSearch')?.value||'').toLowerCase();
    const rows = getSuppliers().filter(s=> !q || [s.name, s.contact_person, s.phone, s.email, s.address].some(v=> String(v||'').toLowerCase().includes(q)));
    if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="8" class="text-muted">No suppliers</td></tr>`; return; }
    tbody.innerHTML = rows.map(s=>{
      const status = s.active===false ? 'Inactive' : 'Active';
      const outstanding = Number(s.outstanding||0);
      return `<tr>
        <td>${s.name||'—'}</td>
        <td>${s.contact_person||'—'}</td>
        <td>${s.phone||'—'}</td>
        <td>${s.email||'—'}</td>
        <td>${s.address||'—'}</td>
        <td>${fmt(outstanding)}</td>
        <td>${status}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary" data-edit-sup="${s.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger ms-1" data-del-sup="${s.id}">Delete</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit-sup]').forEach(btn=> btn.addEventListener('click', (e)=>{ const id = e.currentTarget.getAttribute('data-edit-sup'); const sup = getSuppliers().find(x=>x.id===id); if (sup) openSupplierModal(sup); }));
    tbody.querySelectorAll('[data-del-sup]').forEach(btn=> btn.addEventListener('click', (e)=>{ const id = e.currentTarget.getAttribute('data-del-sup'); if (!confirm('Delete this supplier?')) return; const list = getSuppliers().filter(x=> x.id!==id); saveSuppliers(list); renderSuppliersTable(); showToast('Supplier deleted'); }));
  }

  function ensureSupplierModal(){
    if ($('supplierModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal" id="supplierModal" tabindex="-1">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-header"><h6 class="modal-title">Supplier</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <form id="supplierForm" class="row g-3">
              <input type="hidden" id="sup_id" />
              <div class="col-md-6"><label class="form-label">Name</label><input id="sup_name" class="form-control" required /></div>
              <div class="col-md-6"><label class="form-label">Contact Person</label><input id="sup_contact" class="form-control" /></div>
              <div class="col-md-4"><label class="form-label">Phone</label><input id="sup_phone" class="form-control" /></div>
              <div class="col-md-4"><label class="form-label">Email</label><input id="sup_email" type="email" class="form-control" /></div>
              <div class="col-md-4"><label class="form-label">Address</label><input id="sup_address" class="form-control" /></div>
              <div class="col-12 form-check ms-1"><input id="sup_active" type="checkbox" class="form-check-input" checked /><label class="form-check-label">Active</label></div>
            </form>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button id="supSaveBtn" class="btn btn-primary btn-sm">Save</button></div>
        </div></div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    $('supSaveBtn').addEventListener('click', saveSupplierModal);
  }

  function openSupplierModal(sup){ ensureSupplierModal(); $('sup_id').value = sup?.id||''; $('sup_name').value = sup?.name||''; $('sup_contact').value = sup?.contact_person||''; $('sup_phone').value = sup?.phone||''; $('sup_email').value = sup?.email||''; $('sup_address').value = sup?.address||''; $('sup_active').checked = (sup?.active!==false); bsModal('supplierModal')?.show(); }

  function saveSupplierModal(){
    const id = $('sup_id').value||'';
    const data = { id: id || uid(), name: $('sup_name').value?.trim(), contact_person: $('sup_contact').value?.trim(), phone: $('sup_phone').value?.trim(), email: $('sup_email').value?.trim(), address: $('sup_address').value?.trim(), active: !!$('sup_active').checked, updated_at: nowIso(), };
    if (!data.name){ showAlert('Supplier name is required','danger'); return; }
    const list = getSuppliers(); const idx = list.findIndex(s=> s.id===data.id);
    if (idx>=0){ list[idx] = { ...list[idx], ...data }; }
    else { data.created_at = nowIso(); data.outstanding = Number(data.outstanding||0); list.push(data); }
    saveSuppliers(list); bsModal('supplierModal')?.hide(); renderSuppliersTable(); showToast('Supplier saved');
  }

  // ---------- Purchases ----------
  function ensurePurchaseModal(){
    if ($('purchaseModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal" id="purchaseModal" tabindex="-1">
        <div class="modal-dialog modal-lg"><div class="modal-content">
          <div class="modal-header"><h6 class="modal-title">New Purchase</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-4"><label class="form-label">Date</label><input id="pur_date" type="date" class="form-control" /></div>
              <div class="col-md-8"><label class="form-label">Supplier</label><select id="pur_supplier" class="form-select"></select></div>
            </div>
            <div class="mt-3">
              <div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Line Items</h6><button id="pur_add_line" class="btn btn-outline-secondary btn-sm">+ Add Line</button></div>
              <div class="table-responsive"><table class="table table-sm align-middle" id="pur_lines"><thead><tr><th style="min-width:220px">Product</th><th>Qty</th><th>Unit Cost</th><th>Discount</th><th>Tax %</th><th>Total</th><th></th></tr></thead><tbody></tbody></table></div>
              <div class="d-flex justify-content-end gap-3">
                <div>Subtotal: <strong id="pur_subtotal">0</strong></div>
                <div>Tax: <strong id="pur_tax">0</strong></div>
                <div>Total: <strong id="pur_total">0</strong></div>
              </div>
              <div class="row g-3 mt-2">
                <div class="col-md-4"><label class="form-label">Payment Status</label><select id="pur_status" class="form-select"><option value="paid">Paid</option><option value="partial">Partial</option><option value="credit">Credit</option></select></div>
                <div class="col-md-4"><label class="form-label">Paid Amount</label><input id="pur_paid" type="number" step="0.01" class="form-control" value="0" /></div>
                <div class="col-md-4"><label class="form-label">Method</label><select id="pur_method" class="form-select"><option value="cash">Cash</option><option value="mobile">Mobile Money</option><option value="bank">Bank</option></select></div>
                <div class="col-12" id="pur_method_details" style="display:none">
                  <div class="row g-2">
                    <div class="col-md-3"><label class="form-label">Provider/Bank</label><input id="pur_pay_provider" class="form-control" placeholder="MTN / Airtel / Bank name" /></div>
                    <div class="col-md-3"><label class="form-label">Transaction #</label><input id="pur_pay_txn" class="form-control" placeholder="Txn/Ref number" /></div>
                    <div class="col-md-3"><label class="form-label">Sender Phone</label><input id="pur_pay_phone" class="form-control" placeholder="+256..." /></div>
                    <div class="col-md-3"><label class="form-label">Sender Name</label><input id="pur_pay_name" class="form-control" placeholder="Payer name" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button id="purSaveBtn" class="btn btn-success btn-sm">Save Purchase</button></div>
        </div></div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    $('purSaveBtn').addEventListener('click', savePurchaseModal);
    $('pur_add_line').addEventListener('click', ()=> addPurchaseLine());
    const purMethod = $('pur_method'); if (purMethod){ purMethod.addEventListener('change', ()=> togglePayDetails('pur')); }
  }

  function addPurchaseLine(line){
    const tbody = $('pur_lines')?.querySelector('tbody'); if (!tbody) return;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><select class="form-select form-select-sm" data-col="product"></select></td>
      <td><input type="number" step="1" class="form-control form-control-sm" data-col="qty" value="${Number(line?.qty||1)}" /></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" data-col="unit_cost" value="${Number(line?.unit_cost||0)}" /></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" data-col="discount" value="${Number(line?.discount||0)}" /></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" data-col="tax" value="${Number(line?.tax||0)}" /></td>
      <td class="text-end" data-col="line_total">0</td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm" data-del-line>×</button></td>`;
    tbody.appendChild(row);
    // Fill products (active only)
    const sel = row.querySelector('select[data-col="product"]');
    const prods = getProducts().filter(p=> p.active!==false);
    sel.innerHTML = '<option value="">— Select Product —</option>' + prods.map(p=>`<option value="${p.id}">${p.name} (${p.sku||''})</option>`).join('');
    if (line?.product_id) sel.value = line.product_id;
    // bind change events
    row.querySelectorAll('input,select').forEach(inp=> inp.addEventListener('input', updatePurchaseTotals));
    row.querySelector('[data-del-line]').addEventListener('click', ()=>{ row.remove(); updatePurchaseTotals(); });
    updatePurchaseTotals();
  }

  function updatePurchaseTotals(){
    const tbody = $('pur_lines')?.querySelector('tbody'); if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    let subtotal = 0, tax = 0, total = 0;
    rows.forEach(tr=>{
      const qty = Number(tr.querySelector('[data-col="qty"]').value||0);
      const unit = Number(tr.querySelector('[data-col="unit_cost"]').value||0);
      const disc = Number(tr.querySelector('[data-col="discount"]').value||0);
      const t = Number(tr.querySelector('[data-col="tax"]').value||0);
      const lineBase = Math.max(0, qty * unit - disc);
      const lineTax = lineBase * (t/100);
      const lineTot = lineBase + lineTax;
      subtotal += lineBase; tax += lineTax; total += lineTot;
      tr.querySelector('[data-col="line_total"]').textContent = fmt(lineTot);
    });
    $('pur_subtotal').textContent = fmt(subtotal);
    $('pur_tax').textContent = fmt(tax);
    $('pur_total').textContent = fmt(total);
  }

  function openPurchaseModal(){
    ensurePurchaseModal();
    // Fill suppliers
    const sel = $('pur_supplier'); if (sel){ const ss = getSuppliers().filter(s=> s.active!==false); sel.innerHTML = '<option value="">— Select Supplier —</option>' + ss.map(s=>`<option value="${s.id}">${s.name}</option>`).join(''); }
    // Date today
    const d = $('pur_date'); if (d) d.valueAsDate = new Date();
    // Reset lines
    const tbody = $('pur_lines')?.querySelector('tbody'); if (tbody) tbody.innerHTML='';
    addPurchaseLine();
    bsModal('purchaseModal')?.show();
  }

  function savePurchaseModal(){
    const supplier_id = $('pur_supplier').value||''; if (!supplier_id){ showAlert('Select supplier','danger'); return; }
    const date = $('pur_date').value || new Date().toISOString().slice(0,10);
    const tbody = $('pur_lines')?.querySelector('tbody'); const rows = Array.from(tbody.querySelectorAll('tr'));
    const lines = rows.map(tr=>{
      const product_id = tr.querySelector('[data-col="product"]').value||'';
      const qty = Number(tr.querySelector('[data-col="qty"]').value||0);
      const unit_cost = Number(tr.querySelector('[data-col="unit_cost"]').value||0);
      const discount = Number(tr.querySelector('[data-col="discount"]').value||0);
      const tax = Number(tr.querySelector('[data-col="tax"]').value||0);
      return { product_id, qty, unit_cost, discount, tax };
    }).filter(l=> l.product_id && l.qty>0);
    if (lines.length===0){ showAlert('Add at least one line item','danger'); return; }
    // totals
    let subtotal = 0, tax = 0, total = 0;
    lines.forEach(l=>{ const base = Math.max(0, l.qty*l.unit_cost - l.discount); const t = base*(l.tax/100); subtotal += base; tax += t; total += base+t; });
    const status = $('pur_status').value||'paid';
    const paid_amount = Number($('pur_paid').value||0);
    const method = $('pur_method').value||'cash';
    const business_id = localStorage.getItem(LS_BIZ)||'default';
    const payment_details = readPayDetails('pur', method);
    const purchase = { id: uid(), date, supplier_id, lines, subtotal, tax, total, status, paid_amount, method, payment_details, business_id, created_at: nowIso() };
    const list = getPurchases(); list.push(purchase); savePurchases(list);

    // Update supplier outstanding for credit/partial
    if (status==='credit' || status==='partial'){
      const sup = getSuppliers().find(s=> s.id===supplier_id);
      if (sup){ sup.outstanding = Number(sup.outstanding||0) + (total - (status==='paid' ? total : paid_amount)); saveSuppliers(getSuppliers().map(s=> s.id===sup.id ? sup : s)); }
    }

    bsModal('purchaseModal')?.hide(); renderPurchasesTable(); renderInventoryTable(); showToast('Purchase recorded');
  }

  function renderPurchasesTable(){
    const tbody = $('purchasesTable'); if (!tbody) return;
    const suppliers = getSuppliers();
    const rows = getPurchases().slice().reverse();
    if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No purchases</td></tr>`; return; }
    tbody.innerHTML = rows.map(p=>{
      const s = suppliers.find(x=> x.id===p.supplier_id);
      const prodCount = (p.lines||[]).reduce((a,l)=> a + Number(l.qty||0), 0);
      return `<tr>
        <td>${p.date||'—'}</td>
        <td>${s?.name||'—'}</td>
        <td>${prodCount} items</td>
        <td>${fmt(p.total||0)}</td>
        <td>${(p.status||'paid').toUpperCase()}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-view-pur="${p.id}">View</button></td>
      </tr>`;
    }).join('');
  }

  // ---------- Sales ----------
  function ensureSaleModal(){
    if ($('saleModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal" id="saleModal" tabindex="-1">
        <div class="modal-dialog modal-lg"><div class="modal-content">
          <div class="modal-header"><h6 class="modal-title">Record Sale</h6><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-4"><label class="form-label">Date</label><input id="sale_date" type="date" class="form-control" /></div>
              <div class="col-md-8"><label class="form-label">Customer (optional)</label><input id="sale_customer" class="form-control" placeholder="Walk-in" /></div>
            </div>
            <div class="mt-3">
              <div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Line Items</h6><button id="sale_add_line" class="btn btn-outline-secondary btn-sm">+ Add Line</button></div>
              <div class="table-responsive"><table class="table table-sm align-middle" id="sale_lines"><thead><tr><th style=\"min-width:220px\">Product</th><th>Qty</th><th>Selling Price</th><th>Discount</th><th>Tax %</th><th>Total</th><th></th></tr></thead><tbody></tbody></table></div>
              <div class="d-flex justify-content-end gap-3">
                <div>Subtotal: <strong id="sale_subtotal">0</strong></div>
                <div>Tax: <strong id="sale_tax">0</strong></div>
                <div>Total: <strong id="sale_total">0</strong></div>
              </div>
              <div class="row g-3 mt-2">
                <div class="col-md-4"><label class="form-label">Payment Status</label><select id="sale_status" class="form-select"><option value="paid">Paid</option><option value="partial">Partial</option><option value="credit">Credit</option></select></div>
                <div class="col-md-4"><label class="form-label">Paid Amount</label><input id="sale_paid" type="number" step="0.01" class="form-control" value="0" /></div>
                <div class="col-md-4"><label class="form-label">Method</label><select id="sale_method" class="form-select"><option value="cash">Cash</option><option value="mobile">Mobile Money</option><option value="bank">Bank</option></select></div>
                <div class="col-12" id="sale_method_details" style="display:none">
                  <div class="row g-2">
                    <div class="col-md-3"><label class="form-label">Provider/Bank</label><input id="sale_pay_provider" class="form-control" placeholder="MTN / Airtel / Bank name" /></div>
                    <div class="col-md-3"><label class="form-label">Transaction #</label><input id="sale_pay_txn" class="form-control" placeholder="Txn/Ref number" /></div>
                    <div class="col-md-3"><label class="form-label">Sender Phone</label><input id="sale_pay_phone" class="form-control" placeholder="+256..." /></div>
                    <div class="col-md-3"><label class="form-label">Sender Name</label><input id="sale_pay_name" class="form-control" placeholder="Payer name" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button id="saleSaveBtn" class="btn btn-success btn-sm">Record Sale</button></div>
        </div></div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    $('saleSaveBtn').addEventListener('click', saveSaleModal);
    $('sale_add_line').addEventListener('click', ()=> addSaleLine());
    const saleMethod = $('sale_method'); if (saleMethod){ saleMethod.addEventListener('change', ()=> togglePayDetails('sale')); }
  }

  function addSaleLine(line){
    const tbody = $('sale_lines')?.querySelector('tbody'); if (!tbody) return;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><select class="form-select form-select-sm" data-col="product"></select></td>
      <td><input type="number" step="1" class="form-control form-control-sm" data-col="qty" value="${Number(line?.qty||1)}" /></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" data-col="price" value="${Number(line?.price||0)}" /></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" data-col="discount" value="${Number(line?.discount||0)}" /></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" data-col="tax" value="${Number(line?.tax||0)}" /></td>
      <td class="text-end" data-col="line_total">0</td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm" data-del-line>×</button></td>`;
    tbody.appendChild(row);
    // Fill products (active only)
    const sel = row.querySelector('select[data-col="product"]');
    const prods = getProducts().filter(p=> p.active!==false);
    sel.innerHTML = '<option value="">— Select Product —</option>' + prods.map(p=>`<option value="${p.id}">${p.name} (${p.sku||''})</option>`).join('');
    if (line?.product_id) sel.value = line.product_id;
    // default price suggestion
    const priceInput = row.querySelector('[data-col="price"]');
    sel.addEventListener('change', ()=>{
      const pr = getProducts().find(x=> x.id===sel.value);
      if (pr && !line){ priceInput.value = Number(pr.selling_price||0); }
      updateSaleTotals();
    });
    row.querySelectorAll('input,select').forEach(inp=> inp.addEventListener('input', updateSaleTotals));
    row.querySelector('[data-del-line]').addEventListener('click', ()=>{ row.remove(); updateSaleTotals(); });
    updateSaleTotals();
  }

  function updateSaleTotals(){
    const tbody = $('sale_lines')?.querySelector('tbody'); if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    let subtotal = 0, tax = 0, total = 0;
    rows.forEach(tr=>{
      const qty = Number(tr.querySelector('[data-col="qty"]').value||0);
      const price = Number(tr.querySelector('[data-col="price"]').value||0);
      const disc = Number(tr.querySelector('[data-col="discount"]').value||0);
      const t = Number(tr.querySelector('[data-col="tax"]').value||0);
      const lineBase = Math.max(0, qty * price - disc);
      const lineTax = lineBase * (t/100);
      const lineTot = lineBase + lineTax;
      subtotal += lineBase; tax += lineTax; total += lineTot;
      tr.querySelector('[data-col="line_total"]').textContent = fmt(lineTot);
    });
    $('sale_subtotal').textContent = fmt(subtotal);
    $('sale_tax').textContent = fmt(tax);
    $('sale_total').textContent = fmt(total);
  }

  function openSaleModal(){
    ensureSaleModal();
    const d = $('sale_date'); if (d) d.valueAsDate = new Date();
    const tbody = $('sale_lines')?.querySelector('tbody'); if (tbody) tbody.innerHTML='';
    addSaleLine();
    bsModal('saleModal')?.show();
  }

  function saveSaleModal(){
    const date = $('sale_date').value || new Date().toISOString().slice(0,10);
    const customer = $('sale_customer').value?.trim() || null;
    const tbody = $('sale_lines')?.querySelector('tbody'); const rows = Array.from(tbody.querySelectorAll('tr'));
    const lines = rows.map(tr=>{
      const product_id = tr.querySelector('[data-col="product"]').value||'';
      const qty = Number(tr.querySelector('[data-col="qty"]').value||0);
      const price = Number(tr.querySelector('[data-col="price"]').value||0);
      const discount = Number(tr.querySelector('[data-col="discount"]').value||0);
      const tax = Number(tr.querySelector('[data-col="tax"]').value||0);
      return { product_id, qty, price, discount, tax };
    }).filter(l=> l.product_id && l.qty>0);
    if (lines.length===0){ showAlert('Add at least one line item','danger'); return; }
    let subtotal = 0, tax = 0, total = 0;
    lines.forEach(l=>{ const base = Math.max(0, l.qty*l.price - l.discount); const t = base*(l.tax/100); subtotal += base; tax += t; total += base+t; });
    const status = $('sale_status').value||'paid';
    const paid_amount = Number($('sale_paid').value||0);
    const method = $('sale_method').value||'cash';
    const user = (window.App?.Store?.get()?.user) || JSON.parse(localStorage.getItem('user')||'null');
    const user_name = [user?.fname, user?.lname].filter(Boolean).join(' ') || user?.email || 'User';
    const business_id = localStorage.getItem(LS_BIZ)||'default';
    const payment_details = readPayDetails('sale', method);
    const sale = { id: uid(), date, invoice_no: `INV-${Date.now()}`, user_id: user?.id||null, user_name, customer, lines, subtotal, tax, total, status, paid_amount, method, payment_details, business_id, created_at: nowIso() };
    const list = getSales(); list.push(sale); saveSales(list);

    // Accounts Receivable placeholder if credit/partial (for future integration)
    if (status==='credit' || status==='partial'){
      // store a lightweight AR entry for reports (not integrated with COA yet)
      const ar = load('receivables'); ar.push({ id: uid(), date, customer, sale_id: sale.id, amount: total - (status==='paid' ? total : paid_amount) }); save('receivables', ar);
    }

    bsModal('saleModal')?.hide(); renderSalesTable(); renderInventoryTable(); showToast('Sale recorded');
  }

  function renderSalesTable(){
    const tbody = $('salesTable'); if (!tbody) return;
    const rows = getSales().slice().reverse();
    if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No sales</td></tr>`; return; }
    tbody.innerHTML = rows.map(s=>{
      const prodCount = (s.lines||[]).reduce((a,l)=> a + Number(l.qty||0), 0);
      return `<tr>
        <td>${s.date||'—'}</td>
        <td>${s.invoice_no||'—'}</td>
        <td>${s.user_name || '—'}</td>
        <td>${prodCount} items</td>
        <td>${fmt(s.total||0)}</td>
        <td>${(s.status||'paid').toUpperCase()}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-view-sale="${s.id}">View</button></td>
      </tr>`;
    }).join('');
  }

  // ---------- Inventory ----------
  function renderInventoryTable(){
    const tbody = $('inventoryTable'); if (!tbody) return;
    const cat = $('invFilterCategory')?.value||'';
    const stat = $('invFilterStatus')?.value||'';
    const prods = getProducts().filter(p=> !cat || p.category===cat).filter(p=> !stat || (stat==='inactive' ? (p.active===false) : true));
    if (prods.length===0){ tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No inventory</td></tr>`; return; }
    const rows = prods.map(p=>{
      const stock = computeStock(p.id);
      const lastCost = lastPurchaseCost(p.id);
      const reorder = Number(p.reorder_level||0);
      const totalVal = stock * lastCost;
      return { name: p.name||'—', stock, lastCost, sell: Number(p.selling_price||0), reorder, totalVal, inactive: (p.active===false) };
    }).filter(r=> !(stat==='low' && !(r.stock<=r.reorder)));
    if (rows.length===0){ tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No inventory</td></tr>`; return; }
    tbody.innerHTML = rows.map(r=> `<tr>
      <td>${r.name}</td>
      <td>${r.stock}</td>
      <td>${fmt(r.lastCost)}</td>
      <td>${fmt(r.sell)}</td>
      <td>${r.reorder}</td>
      <td>${fmt(r.totalVal)}</td>
    </tr>`).join('');
  }

  function ensureModals(){ ensureProductModal(); ensureSupplierModal(); ensurePurchaseModal(); ensureSaleModal(); }

  // Payment detail helpers (mobile money / bank)
  function togglePayDetails(prefix){
    const sel = $(prefix+"_method"); const box = $(prefix+"_method_details"); if (!sel || !box) return;
    const v = sel.value; box.style.display = (v==='mobile' || v==='bank') ? '' : 'none';
  }
  function readPayDetails(prefix, method){
    if (!(method==='mobile' || method==='bank')) return null;
    return {
      provider: $(prefix+"_pay_provider")?.value?.trim()||null,
      txn: $(prefix+"_pay_txn")?.value?.trim()||null,
      phone: $(prefix+"_pay_phone")?.value?.trim()||null,
      name: $(prefix+"_pay_name")?.value?.trim()||null,
      method
    };
  }

  Admin.Stock = { setupUI, refreshAll };
})();
