const API_PATHS = {
  token: "/api/Auth/RequestToken",
  submit: "/api/Transactions/SubmitOrderRequest",
  status: "/api/Transactions/GetTransactionStatus",
  registerIpn: "/api/URLSetup/RegisterIPN",
};

let cachedToken = null;
let tokenExpiresAt = 0;

function pesapalBaseUrl() {
  if (process.env.PESAPAL_BASE_URL) return process.env.PESAPAL_BASE_URL.replace(/\/$/, "");
  return String(process.env.PESAPAL_ENV || "sandbox").toLowerCase() === "live"
    ? "https://pay.pesapal.com/v3"
    : "https://cybqa.pesapal.com/pesapalv3";
}

function requiredCredentials() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error("Pesapal is not configured on the server");
  return { consumerKey, consumerSecret };
}

async function pesapalFetch(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${pesapalBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error?.message) {
    throw new Error(data?.error?.message || data?.message || `Pesapal request failed (${response.status})`);
  }
  return data;
}

export async function getPesapalToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;
  const { consumerKey, consumerSecret } = requiredCredentials();
  const data = await pesapalFetch(API_PATHS.token, {
    method: "POST",
    body: { consumer_key: consumerKey, consumer_secret: consumerSecret },
  });
  if (!data?.token) throw new Error("Pesapal did not return an access token");
  cachedToken = data.token;
  const expiry = data.expiryDate ? new Date(data.expiryDate).getTime() : Date.now() + 4 * 60_000;
  tokenExpiresAt = Number.isFinite(expiry) ? expiry : Date.now() + 4 * 60_000;
  return cachedToken;
}

export async function submitPesapalOrder({ merchantReference, amount, currency, description, callbackUrl, phone, email, firstName, lastName }) {
  const token = await getPesapalToken();
  const notificationId = process.env.PESAPAL_IPN_ID;
  if (!notificationId) throw new Error("Pesapal IPN is not configured; register the notification URL and set PESAPAL_IPN_ID");
  if (!phone && !email) throw new Error("A payer phone number or email is required for Pesapal checkout");
  const data = await pesapalFetch(API_PATHS.submit, {
    token,
    method: "POST",
    body: {
      id: merchantReference,
      currency: String(currency || "UGX").toUpperCase(),
      amount: Number(amount),
      description: String(description || "JibuSales subscription").slice(0, 100),
      callback_url: callbackUrl,
      notification_id: notificationId,
      redirect_mode: "TOP_WINDOW",
      billing_address: {
        phone_number: phone || "",
        email_address: email || "",
        country_code: "UG",
        first_name: firstName || "JibuSales",
        middle_name: "",
        last_name: lastName || "Customer",
        line_1: "",
        line_2: "",
        city: "",
        state: "",
        postal_code: "",
        zip_code: "",
      },
    },
  });
  if (!data?.order_tracking_id || !data?.redirect_url) throw new Error(data?.message || "Pesapal did not return a checkout link");
  return { trackingId: data.order_tracking_id, merchantReference: data.merchant_reference || merchantReference, checkoutUrl: data.redirect_url };
}

export async function getPesapalTransactionStatus(trackingId) {
  const token = await getPesapalToken();
  return pesapalFetch(`${API_PATHS.status}?orderTrackingId=${encodeURIComponent(trackingId)}`, { token });
}

export async function registerPesapalIpn(url) {
  const token = await getPesapalToken();
  return pesapalFetch(API_PATHS.registerIpn, {
    token,
    method: "POST",
    body: { url, ipn_notification_type: "GET" },
  });
}

export function normalizePesapalStatus(data) {
  const description = String(data?.payment_status_description || "").trim().toLowerCase();
  const code = Number(data?.status_code);
  if (description === "completed" || code === 1) return "completed";
  if (["failed", "invalid", "reversed"].includes(description) || [0, 2, 3].includes(code)) {
    return description === "reversed" || code === 3 ? "reversed" : "failed";
  }
  return "pending";
}

export function getPesapalCallbackUrl() {
  const baseUrl = process.env.PESAPAL_CALLBACK_BASE_URL || process.env.BASE_URL;
  if (!baseUrl) throw new Error("Set BASE_URL or PESAPAL_CALLBACK_BASE_URL to the public backend URL");
  return `${baseUrl.replace(/\/$/, "")}/api/tenants/billing-reminder/pesapal/callback`;
}

export function getPesapalIpnUrl() {
  const baseUrl = process.env.PESAPAL_CALLBACK_BASE_URL || process.env.BASE_URL;
  if (!baseUrl) throw new Error("Set BASE_URL or PESAPAL_CALLBACK_BASE_URL to the public backend URL");
  return `${baseUrl.replace(/\/$/, "")}/api/tenants/billing-reminder/pesapal/ipn`;
}
