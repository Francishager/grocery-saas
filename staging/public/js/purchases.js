const API_URL = (window.APP_CONFIG?.API_URL) || ( /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://localhost:3000' : '' );
let cart = [];
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));
let myProfile = null; // will include txn_account/txn_account_code if set

if (!token || !user || !["Owner","Manager","Accountant","SaaS Admin"].includes(user.role)) {
  window.location.href = "index.html";
}

if (!API_URL) {
  alert('Backend API URL is not configured. Append ?api=https://your-api.example.com to the URL or set localStorage.API_URL.');
}

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": (options.headers && options.headers["Content-Type"]) || (options.body ? "application/json" : undefined),
    },
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "index.html";
    throw new Error("Unauthorized");
  }
  return res;
}

// Load current user profile to ensure a transaction account is assigned
(async function ensureTxnAccount(){
  try{
    const res = await authFetch(`${API_URL}/me/profile`);
    myProfile = await res.json();
    const code = myProfile?.txn_account || myProfile?.txn_account_code || myProfile?.txn_acct || myProfile?.transaction_account || '';
    if (!code || String(code).trim() === ''){
      const msg = 'Transaction account is required to record purchases. Please contact your admin to assign a transaction account.';
      try{
        const container = document.querySelector('.container');
        if (container){
          const alert = document.createElement('div');
          alert.className = 'alert alert-warning mt-3';
          alert.textContent = msg;
          container.prepend(alert);
        } else { alert(msg); }
      }catch{ alert(msg); }
    }
  }catch(err){ console.warn('Failed to load profile:', err?.message); }
})();

// Search Inventory
const searchEl = document.getElementById("searchItem");
if (searchEl){
  searchEl.addEventListener("input", async (e) => {
    let res = await authFetch(`${API_URL}/inventory/${user.business_id}?q=${encodeURIComponent(e.target.value)}`);
    let items = await res.json();

    const list = document.getElementById("itemList");
    list.innerHTML = "";
    items.forEach(item => {
      let li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center";
      const name = item.name || item.product_name;
      const cost = item.cost_price || item.cost_of_goods || item.unit_cost || item.unit_price || item.selling_price || 0;
      li.innerHTML = `${name} - ${cost} <button class="btn btn-sm btn-primary">Add</button>`;
      li.querySelector("button").onclick = () => addToCart(item);
      list.appendChild(li);
    });
  });
}

function addToCart(item) {
  const found = cart.find(c => c.id === item.id);
  const name = item.name || item.product_name;
  const cost = item.cost_price || item.cost_of_goods || item.unit_cost || item.unit_price || item.selling_price || 0;
  if (found) {
    found.qty++;
    found.unit_cost = cost; // reflect latest cost
  } else {
    cart.push({ ...item, name, unit_cost: cost, qty: 1 });
  }
  renderCart();
}

function renderCart() {
  const table = document.getElementById("cartTable");
  if (!table) return;
  table.innerHTML = "";
  let total = 0;

  cart.forEach((c, i) => {
    const unit = Number(c.unit_cost || 0);
    let lineTotal = c.qty * unit;
    total += lineTotal;

    table.innerHTML += `
      <tr>
        <td>${c.name}</td>
        <td><input type="number" value="${c.qty}" min="1" class="form-control form-control-sm" onchange="updateQty(${i}, this.value)"></td>
        <td><input type="number" value="${unit}" min="0" step="0.01" class="form-control form-control-sm" onchange="updateCost(${i}, this.value)"></td>
        <td>${lineTotal.toFixed(2)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="removeItem(${i})">x</button></td>
      </tr>
    `;
  });

  document.getElementById("cartTotal").innerText = total.toFixed(2);
}

function updateQty(index, qty) {
  cart[index].qty = Math.max(1, parseInt(qty || 1));
  renderCart();
}

function updateCost(index, cost) {
  cart[index].unit_cost = Math.max(0, Number(cost || 0));
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  renderCart();
}

async function checkoutPurchase() {
  const vendor_name = document.getElementById("vendorName")?.value?.trim() || '';
  const invoice_no = document.getElementById("invoiceNo")?.value?.trim() || '';

  const code = myProfile?.txn_account || myProfile?.txn_account_code || myProfile?.txn_acct || myProfile?.transaction_account || '';
  if (!code || String(code).trim() === ''){
    alert('Transaction account is required to record purchases. Please contact your admin to assign a transaction account.');
    return;
  }

  const items = cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, unit_cost: Number(c.unit_cost || 0) }));
  if (!items.length){ alert('Cart is empty.'); return; }

  let res = await authFetch(`${API_URL}/purchases/checkout`, {
    method: "POST",
    body: JSON.stringify({ business_id: user.business_id, items, vendor_name, invoice_no })
  });

  const out = await res.json();
  if (!res.ok){
    alert(out?.error || 'Failed to record purchases');
    return;
  }

  // Success
  showToast?.('Purchases recorded');
  cart = [];
  renderCart();
}

function printReceipt() {
  let html = `Vendor: ${document.getElementById('vendorName')?.value || ''}<br>Invoice: ${document.getElementById('invoiceNo')?.value || ''}<br>`;
  html += document.querySelector('.table')?.outerHTML || '';
  let w = window.open("", "Print");
  w.document.write(html);
  w.print();
  w.close();
}

// Expose for inline handlers
window.updateQty = updateQty;
window.updateCost = updateCost;
window.removeItem = removeItem;
window.checkoutPurchase = checkoutPurchase;
window.printReceipt = printReceipt;
