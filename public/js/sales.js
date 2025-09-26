const API_URL = (window.APP_CONFIG?.API_URL) || ( /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://localhost:3000' : '' );
let cart = [];
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));
let myProfile = null; // will include txn_account_code if set

if (!token || !user || !["Owner","Attendant","SaaS Admin"].includes(user.role)) {
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
    const code = myProfile?.txn_account_code || myProfile?.txn_acct || myProfile?.transaction_account || '';
    if (!code || String(code).trim() === ''){
      const msg = 'Transaction account is required to perform sales. Please contact your admin to assign a transaction account.';
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
document.getElementById("searchItem").addEventListener("input", async (e) => {
  let res = await authFetch(`${API_URL}/inventory/${user.business_id}?q=${encodeURIComponent(e.target.value)}`);
  let items = await res.json();

  const list = document.getElementById("itemList");
  list.innerHTML = "";
  items.forEach(item => {
    let li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    const name = item.name || item.product_name;
    const price = item.selling_price || item.unit_price || 0;
    li.innerHTML = `${name} - ${price} 
      <button class="btn btn-sm btn-primary">Add</button>`;
    li.querySelector("button").onclick = () => addToCart(item);
    list.appendChild(li);
  });
});

function addToCart(item) {
  const found = cart.find(c => c.id === item.id);
  if (found) {
    found.qty++;
  } else {
    const name = item.name || item.product_name;
    const price = item.selling_price || item.unit_price || 0;
    cart.push({ ...item, name, selling_price: price, qty: 1 });
  }
  renderCart();
}

function renderCart() {
  const table = document.getElementById("cartTable");
  table.innerHTML = "";
  let total = 0;

  cart.forEach((c, i) => {
    let lineTotal = c.qty * (c.selling_price || 0);
    total += lineTotal;

    table.innerHTML += `
      <tr>
        <td>${c.name}</td>
        <td><input type="number" value="${c.qty}" min="1" class="form-control form-control-sm" onchange="updateQty(${i}, this.value)"></td>
        <td>${c.selling_price}</td>
        <td>${lineTotal}</td>
        <td><button class="btn btn-sm btn-danger" onclick="removeItem(${i})">x</button></td>
      </tr>
    `;
  });

  document.getElementById("cartTotal").innerText = total.toFixed(2);
}

function updateQty(index, qty) {
  cart[index].qty = parseInt(qty);
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  renderCart();
}

async function checkout() {
  const paymentMode = document.getElementById("paymentMode").value;

  // Enforce transaction account presence client-side as well
  const code = myProfile?.txn_account_code || myProfile?.txn_acct || myProfile?.transaction_account || '';
  if (!code || String(code).trim() === ''){
    alert('Transaction account is required to perform sales. Please contact your admin to assign a transaction account.');
    return;
  }

  let res = await authFetch(`${API_URL}/sales/checkout`, {
    method: "POST",
    body: JSON.stringify({ business_id: user.business_id, cart, payment_mode: paymentMode })
  });

  const sale = await res.json();

  // Show receipt
  let receiptHTML = `
    <h6>Business: ${user.business_name}</h6>
    <p>Date: ${new Date().toLocaleString()}</p>
    <table class="table table-sm">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>
        ${cart.map(c => `<tr><td>${c.name}</td><td>${c.qty}</td><td>${c.selling_price || 0}</td></tr>`).join("")}
      </tbody>
    </table>
    <p><b>Total:</b> ${document.getElementById("cartTotal").innerText}</p>
    <p><b>Payment:</b> ${paymentMode}</p>
  `;

  document.getElementById("receiptContent").innerHTML = receiptHTML;
  new bootstrap.Modal(document.getElementById("receiptModal")).show();

  // Reset cart
  cart = [];
  renderCart();
}

function printReceipt() {
  let content = document.getElementById("receiptContent").innerHTML;
  let w = window.open("", "Print");
  w.document.write(content);
  w.print();
  w.close();
}

// Expose for inline handlers
window.updateQty = updateQty;
window.removeItem = removeItem;
window.checkout = checkout;
window.printReceipt = printReceipt;
