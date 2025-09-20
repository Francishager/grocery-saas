const API_URL = "http://localhost:3000";

// Handle login form submission
document.addEventListener("DOMContentLoaded", function() {
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError");

    if (loginForm) {
        loginForm.addEventListener("submit", async function(e) {
            e.preventDefault();
            
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            
            // Clear previous errors
            loginError.style.display = "none";
            
            // Basic validation
            if (!email || !password) {
                showError("Please fill in all fields");
                return;
            }
            
            // Show loading state
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "Logging in...";
            submitBtn.disabled = true;
            
            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Store token and user data
                    localStorage.setItem("token", data.token);
                    localStorage.setItem("user", JSON.stringify(data.user));
                    
                    // Redirect based on role
                    redirectBasedOnRole(data.user.role);
                } else {
                    showError(data.error || "Login failed");
                }
                
            } catch (error) {
                console.error("Login error:", error);
                showError("Network error. Please try again.");
            } finally {
                // Reset button state
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // Check if user is already logged in
    checkExistingSession();
});

function showError(message) {
    const loginError = document.getElementById("loginError");
    loginError.textContent = message;
    loginError.style.display = "block";
}

function redirectBasedOnRole(role) {
    if (role === "SaaS Admin") {
        window.location.href = "admin.html";
    } else {
        window.location.href = "dashboard.html";
    }
}

async function checkExistingSession() {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    
    if (token && user) {
        try {
            // Validate token with server
            const response = await fetch(`${API_URL}/validate-token`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const userData = JSON.parse(user);
                redirectBasedOnRole(userData.role);
            } else {
                // Token is invalid, clear storage
                localStorage.removeItem("token");
                localStorage.removeItem("user");
            }
        } catch (error) {
            console.error("Token validation error:", error);
            // Clear invalid session data
            localStorage.removeItem("token");
            localStorage.removeItem("user");
        }
    }
}

// Utility function to get stored user data
function getStoredUser() {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
}

// Utility function to get stored token
function getStoredToken() {
    return localStorage.getItem("token");
}

// Utility function to logout
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "index.html";
}

// Make functions available globally
window.logout = logout;
window.getStoredUser = getStoredUser;
window.getStoredToken = getStoredToken;
