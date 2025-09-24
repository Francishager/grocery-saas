const API_URL = (window.APP_CONFIG?.API_URL) || ( /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://localhost:3000' : '' );
const user = JSON.parse(localStorage.getItem("user"));
const token = localStorage.getItem("token");

// Role check
if(!user || !["Owner","Accountant","SaaS Admin"].includes(user.role)){
  alert("Unauthorized");
  window.location.href="index.html";
}

if (!token) {
  window.location.href = "index.html";
}

// Require API URL in production (GitHub Pages)
if (!API_URL) {
  alert('Backend API URL is not configured. Append ?api=https://your-api.example.com to the URL or set localStorage.API_URL.');
}

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
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

// --- Load all dashboard data ---
async function loadDashboard() {
  await loadKPIs();
  await loadLowStock();
  await loadTopProducts();
  await loadStaffLeaderboard();
  await loadDailySummary();
  await loadMonthlySummary();
}

// --- KPIs ---
async function loadKPIs(){
  try {
    const res = await authFetch(`${API_URL}/dashboard/kpis?businessId=${user.business_id}`);
    const data = await res.json();
    document.getElementById("kpiTotalSales").textContent = `$${data.total_sales.toFixed(2)}`;
    document.getElementById("kpiTotalProfit").textContent = `$${data.total_profit.toFixed(2)}`;
    document.getElementById("kpiTotalDiscount").textContent = `$${data.total_discount.toFixed(2)}`;
    document.getElementById("kpiTotalTax").textContent = `$${data.total_tax.toFixed(2)}`;

    window.lowStockData = data.low_stock; // Save for low stock list
  } catch (err) {
    console.error("Failed to load KPIs", err);
  }
}

// --- Low Stock Alerts ---
async function loadLowStock(){
  const list = document.getElementById("lowStockList");
  list.innerHTML = "";
  if(window.lowStockData && window.lowStockData.length > 0){
    window.lowStockData.forEach(item=>{
      const li = document.createElement("li");
      li.className = "list-group-item list-group-item-danger fw-bold";
      li.textContent = `${item.product_name || item.name} - Qty: ${item.quantity}`;
      list.appendChild(li);
    });
  } else {
    list.innerHTML = `<li class="list-group-item">No low stock items</li>`;
  }
}

// --- Top 5 Products Chart ---
async function loadTopProducts(){
  try {
    const res = await authFetch(`${API_URL}/reports/products?businessId=${user.business_id}`);
    const data = await res.json();
    new Chart(document.getElementById("topProductsChart").getContext("2d"), {
      type: 'bar',
      data: {
        labels: data.map(d => d.product),
        datasets: [{
          label: 'Profit',
          data: data.map(d => d.profit),
          backgroundColor: 'rgba(54,162,235,0.6)'
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
  } catch(err){
    console.error("Failed to load top products", err);
  }
}

// --- Staff Leaderboard Chart ---
async function loadStaffLeaderboard(){
  try {
    const res = await authFetch(`${API_URL}/reports/staff?businessId=${user.business_id}`);
    const data = await res.json();
    new Chart(document.getElementById("staffLeaderboardChart").getContext("2d"), {
      type: 'bar',
      data: {
        labels: data.map(d => d.staff),
        datasets: [{
          label: 'Profit',
          data: data.map(d => d.profit),
          backgroundColor: 'rgba(153,102,255,0.6)'
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
  } catch(err){
    console.error("Failed to load staff leaderboard", err);
  }
}

// --- Daily Summary Chart ---
async function loadDailySummary(){
  try {
    const res = await authFetch(`${API_URL}/reports/daily?businessId=${user.business_id}`);
    const data = await res.json();
    new Chart(document.getElementById("dailySummaryChart").getContext("2d"), {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          label: 'Profit',
          data: data.map(d => d.profit),
          backgroundColor: 'rgba(75,192,192,0.6)',
          fill: true
        }]
      },
      options: { responsive: true }
    });
  } catch(err){
    console.error("Failed to load daily summary", err);
  }
}

// --- Monthly Summary Chart ---
async function loadMonthlySummary(){
  try {
    const res = await authFetch(`${API_URL}/reports/monthly?businessId=${user.business_id}`);
    const data = await res.json();
    new Chart(document.getElementById("monthlySummaryChart").getContext("2d"), {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Profit',
          data: data.map(d => d.profit),
          backgroundColor: 'rgba(255,159,64,0.6)',
          fill: true
        }]
      },
      options: { responsive: true }
    });
  } catch(err){
    console.error("Failed to load monthly summary", err);
  }
}

// --- Export Placeholder ---
function exportDashboard(type){
  alert(`Export ${type} not implemented yet`);
}

// Load dashboard on page load
loadDashboard();
