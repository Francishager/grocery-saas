const API_URL = (window.APP_CONFIG?.API_URL) || ( /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://localhost:3000' : '' );
const user = JSON.parse(localStorage.getItem("user"));
const token = localStorage.getItem("token");

// Role-based access
if (!user || !["Owner","Accountant","SaaS Admin"].includes(user.role)) {
  alert("Unauthorized access");
  window.location.href = "index.html";
}

if (!token) {
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

// ===== Dashboard KPIs + Low Stock =====
async function loadDashboardKPIs() {
  try {
    const res = await authFetch(`${API_URL}/dashboard/kpis?businessId=${user.business_id}`);
    const data = await res.json();

    document.getElementById("kpiTotalSales").textContent = `$${data.total_sales.toFixed(2)}`;
    document.getElementById("kpiTotalProfit").textContent = `$${data.total_profit.toFixed(2)}`;
    document.getElementById("kpiTotalDiscount").textContent = `$${data.total_discount.toFixed(2)}`;
    document.getElementById("kpiTotalTax").textContent = `$${data.total_tax.toFixed(2)}`;

    // Low stock alerts
    const lowStockList = document.getElementById("lowStockList");
    lowStockList.innerHTML = "";
    if (data.low_stock && data.low_stock.length > 0) {
      data.low_stock.forEach(item => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-danger fw-bold";
        li.textContent = `${item.product_name || item.name} - Qty: ${item.quantity}`;
        lowStockList.appendChild(li);
      });
    } else {
      lowStockList.innerHTML = `<li class="list-group-item">No low stock items!</li>`;
    }

  } catch (err) {
    console.error("Error loading dashboard KPIs:", err);
  }
}

// ===== Load Reports =====
async function loadReports() {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;

  await loadDashboardKPIs(); // KPIs + low stock
  await loadDailyReport(start, end);
  await loadMonthlyReport(start, end);
  await loadStaffReport(start, end);
  await loadProductsReport(start, end);
}

// ===== Daily Report =====
async function loadDailyReport(start, end) {
  const res = await authFetch(`${API_URL}/reports/daily?businessId=${user.business_id}&start=${start}&end=${end}`);
  const data = await res.json();

  const tbody = document.getElementById("dailyTable");
  tbody.innerHTML = "";
  data.forEach(row => {
    const profitClass = row.profit < 0 ? "text-danger fw-bold" : "";
    tbody.innerHTML += `<tr>
      <td>${row.date}</td><td>${row.gross}</td><td>${row.discount}</td>
      <td>${row.tax}</td><td>${row.cost}</td>
      <td class="${profitClass}">${row.profit}</td>
    </tr>`;
  });

  new Chart(document.getElementById('dailyChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d=>d.date),
      datasets: [
        { label: 'Gross', data: data.map(d=>d.gross), backgroundColor:'rgba(54,162,235,0.6)' },
        { label: 'Discount', data: data.map(d=>d.discount), backgroundColor:'rgba(255,99,132,0.6)' },
        { label: 'Tax', data: data.map(d=>d.tax), backgroundColor:'rgba(255,206,86,0.6)' },
        { label: 'Profit', data: data.map(d=>d.profit), backgroundColor:'rgba(75,192,192,0.6)' }
      ]
    },
    options: { responsive:true, plugins:{legend:{position:'top'}} }
  });
}

// ===== Monthly Report =====
async function loadMonthlyReport(start, end) {
  const res = await authFetch(`${API_URL}/reports/monthly?businessId=${user.business_id}&start=${start}&end=${end}`);
  const data = await res.json();

  const tbody = document.getElementById("monthlyTable");
  tbody.innerHTML = "";
  data.forEach(row=>{
    const profitClass = row.profit<0?"text-danger fw-bold":"";
    tbody.innerHTML+=`<tr>
      <td>${row.month}</td><td>${row.gross}</td><td>${row.discount}</td>
      <td>${row.tax}</td><td>${row.cost}</td>
      <td class="${profitClass}">${row.profit}</td>
    </tr>`;
  });

  new Chart(document.getElementById('monthlyChart').getContext('2d'), {
    type:'line',
    data:{
      labels:data.map(d=>d.month),
      datasets:[
        {label:'Gross',data:data.map(d=>d.gross),backgroundColor:'rgba(54,162,235,0.6)'},
        {label:'Profit',data:data.map(d=>d.profit),backgroundColor:'rgba(75,192,192,0.6)'}
      ]
    },
    options:{responsive:true,plugins:{legend:{position:'top'}}}
  });
}

// ===== Staff Report =====
async function loadStaffReport(start,end){
  const res=await authFetch(`${API_URL}/reports/staff?businessId=${user.business_id}&start=${start}&end=${end}`);
  const data=await res.json();

  const tbody=document.getElementById("staffTable");
  tbody.innerHTML="";
  data.forEach(r=>{
    tbody.innerHTML+=`<tr><td>${r.staff}</td><td>${r.sales_count}</td><td>${r.total_revenue}</td><td>${r.profit}</td></tr>`;
  });

  new Chart(document.getElementById('staffChart').getContext('2d'),{
    type:'bar',
    data:{
      labels:data.map(d=>d.staff),
      datasets:[{label:'Profit',data:data.map(d=>d.profit),backgroundColor:'rgba(153,102,255,0.6)'}]
    },
    options:{responsive:true,plugins:{legend:{position:'top'}}}
  });
}

// ===== Products Report =====
async function loadProductsReport(start,end){
  const res=await authFetch(`${API_URL}/reports/products?businessId=${user.business_id}&start=${start}&end=${end}`);
  const data=await res.json();

  const tbody=document.getElementById("productsTable");
  tbody.innerHTML="";
  data.forEach(r=>{
    tbody.innerHTML+=`<tr><td>${r.product}</td><td>${r.quantity}</td><td>${r.revenue}</td><td>${r.profit}</td></tr>`;
  });

  new Chart(document.getElementById('productsChart').getContext('2d'),{
    type:'bar',
    data:{
      labels:data.map(d=>d.product),
      datasets:[{label:'Profit',data:data.map(d=>d.profit),backgroundColor:'rgba(255,159,64,0.6)'}]
    },
    options:{responsive:true,plugins:{legend:{position:'top'}}}
  });
}

// ===== Export Placeholder =====
function exportReport(type){ alert(`Export ${type} not implemented yet`);}
