const API_URL = (window.APP_CONFIG?.API_URL) || ( /^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://localhost:3000' : '' );

// ===== Session =====
function getUser() {
  return JSON.parse(localStorage.getItem("user"));
}

function checkAuth() {
  const user = getUser();
  if (!user) window.location.href = "index.html";
  return user;
}

// ===== Role-based UI =====
function applyRoleUI(user) {
  document.getElementById("userName").innerText = user.fname;
  document.getElementById("userRole").innerText = user.role;
  if (document.getElementById("businessName")) {
    document.getElementById("businessName").innerText = user.business_name || "N/A";
  }

  // Show elements based on role
  document.querySelectorAll(`.role-${user.role.toLowerCase()}`).forEach(el => el.classList.remove("d-none"));

  // Owner/SaaS Admin can add items
  if (user.role === "Owner" || user.role === "SaaS Admin") {
    const btn = document.getElementById("addItemBtn");
    if (btn) btn.classList.remove("d-none");

    document.querySelectorAll(".owner-only").forEach(el => el.classList.remove("d-none"));
  }
}

// ===== Inventory =====
async function loadInventory() {
  const user = checkAuth();

  let res = await fetch(`${API_URL}/inventory/${user.business_id}`);
  let items = await res.json();

  const table = document.getElementById("inventoryTable");
  if (!table) return;

  table.innerHTML = "";
  items.forEach(item => {
    table.innerHTML += `
      <tr>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.quantity}</td>
        <td>${item.cost_price}</td>
        <td>${item.selling_price}</td>
        ${user.role === "Owner" || user.role === "SaaS Admin" ? `<td><button class="btn btn-sm btn-danger">Delete</button></td>` : ""}
      </tr>`;
  });
}

// ===== Auth Checks on Load =====
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  if (path.includes("dashboard.html") || path.includes("inventory.html")) {
    const user = checkAuth();
    applyRoleUI(user);

    if (path.includes("inventory.html")) {
      loadInventory();
    }
  }
  if (!API_URL && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)){
    console.warn('Backend API URL is not configured. Append ?api=https://your-api.example.com to the URL or set localStorage.API_URL.');
  }
});

// ===== Logout =====
function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
}
