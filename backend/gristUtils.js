import fetch from "node-fetch";
import dotenv from "dotenv";
import { encrypt as cryptoEncrypt, decrypt as cryptoDecrypt } from "./cryptoUtils.js";
dotenv.config();

const API_KEY = process.env.GRIST_API_KEY;
const DOC_ID = process.env.GRIST_DOC_ID;
const BASE_URL = `https://docs.getgrist.com/api/docs/${DOC_ID}/tables`;

// Encrypt-everything-by-default policy with a whitelist of fields that must remain
// plaintext to support server-side filtering, sorting, and clean UI display.
// You can override with UNENCRYPTED_FIELDS env var (comma-separated).
// Expanded defaults include common presentational, relational, numeric, and date fields
// used across admin CRUD (Plans/Subscriptions, Businesses, Branches) and Sales.
const UNENCRYPTED_FIELDS = new Set(
  String(process.env.UNENCRYPTED_FIELDS || [
    // Common identifiers & timestamps
    'business_id','branch_id','owner_id',
    'created_at','updated_at','date','last_login',
    // Presentational fields
    'name','code','description','status','is_active','business_name','logo_url',
    // Plan/Subscription fields
    'price','price_monthly','price_termly','price_annual','billing_cycle',
    // Plan limits (numeric)
    'limit_max_staff','limit_max_branches',
    // Subscription_Features mapping fields
    'subscription_id','feature_id','limit_value',
    // Business lifecycle dates
    'start_date','end_date','fiscal_year_start','fiscal_year_end','opening_date',
    // Auth/OTP meta (strings/dates)
    'otp_code','otp_expires','force_password_reset',
    // Sales/Purchases posting fields (numeric/text)
    'product_id','product_name','quantity','unit_price','discount','tax','total','cost_of_goods','payment_mode','staff_name','unit_cost','total_cost','vendor_name','invoice_no'
  ].join(','))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

function encryptRecord(tableName, fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = UNENCRYPTED_FIELDS.has(k) ? v : cryptoEncrypt(v);
  }
  return out;
}

// List Grist tables for diagnostics
export async function listGristTables() {
  try {
    const url = `https://docs.getgrist.com/api/docs/${DOC_ID}/tables`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!res.ok) return [];
    const json = await res.json().catch(()=>null);
    const list = Array.isArray(json?.tables) ? json.tables : (Array.isArray(json) ? json : []);
    return list.map(t => t.id || t.tableId || t.name).filter(Boolean);
  } catch (e) {
    console.warn('listGristTables failed:', e?.message);
    return [];
  }
}

// Fetch Grist table columns for diagnostics
export async function fetchTableColumns(tableName) {
  try {
    const url = `${BASE_URL}/${tableName}/columns`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    if (!res.ok) return [];
    const json = await res.json();
    // json.columns: [{ id, fields: { ... } }] shape; normalize to names
    const cols = (json.columns || []).map(c => c.id || c.colId || c.fields?.id || c.fields?.colId || c.name).filter(Boolean);
    return cols;
  } catch (e) {
    console.warn('fetchTableColumns failed for', tableName, e?.message);
    return [];
  }
}

function decryptRecord(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = cryptoDecrypt(v);
  return out;
}

// Public helper: recursively decrypt arrays/objects/strings
export function decryptDeep(value) {
  if (Array.isArray(value)) return value.map(decryptDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decryptDeep(v);
    return out;
  }
  return cryptoDecrypt(value);
}

// Fetch all records from a Grist table (optionally filter by businessId and date range)
export async function fetchFromGrist(tableName, businessId=null, start=null, end=null) {
  try {
    let url = `${BASE_URL}/${tableName}/records`;
    const params = new URLSearchParams();
    if (businessId) params.append('filter[business_id]', businessId);
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const json = await res.json();
    let records = json.records.map(r => ({ id: r.id, ...decryptRecord(r.fields) }));

    // Filter by businessId if provided
    if (businessId) {
      records = records.filter(r => r.business_id === businessId);
    }

    // Filter by date range if provided
    if (start && end && records.length > 0 && records[0].date) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      records = records.filter(r => {
        const d = new Date(r.date);
        return d >= startDate && d <= endDate;
      });
    }

    return records;

  } catch(err){
    console.error("Error fetching Grist table:", tableName, err);
    return [];
  }
}

// Add a new record to a Grist table
export async function addToGrist(tableName, data) {
  try {
    const url = `${BASE_URL}/${tableName}/records`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: [{ fields: encryptRecord(tableName, data) }]
      })
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}, message: ${text}`);
    }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (json && Array.isArray(json.records) && json.records.length) {
      return { success: true, data: { id: json.records[0]?.id, ...decryptRecord(json.records[0]?.fields || {}) } };
    }
    // Fallback: return decrypted payload when API returned empty body
    return { success: true, data: decryptRecord(data) };

  } catch(err) {
    console.error("Error adding to Grist table:", tableName, err);
    return { success: false, error: err.message };
  }
}

// Update an existing record in a Grist table
export async function updateGristRecord(tableName, recordId, data) {
  try {
    const url = `${BASE_URL}/${tableName}/records`;

    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: [{ 
          id: recordId, 
          fields: encryptRecord(tableName, data) 
        }]
      })
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}, message: ${text}`);
    }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (json && Array.isArray(json.records) && json.records.length) {
      return { success: true, data: { id: json.records[0]?.id, ...decryptRecord(json.records[0]?.fields || {}) } };
    }
    // Fallback: return minimal data when API returned empty body
    return { success: true, data: { id: recordId, ...decryptRecord(data) } };

  } catch(err) {
    console.error("Error updating Grist record:", tableName, recordId, err);
    return { success: false, error: err.message };
  }
}

// Delete a record from a Grist table
export async function deleteFromGrist(tableName, recordId) {
  try {
    const url = `${BASE_URL}/${tableName}/records`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ids: [Number(recordId)] })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
    }

    return { success: true };

  } catch(err) {
    console.error("Error deleting from Grist table:", tableName, recordId, err);
    return { success: false, error: err.message };
  }
}

// Bulk operations for better performance
export async function bulkAddToGrist(tableName, dataArray) {
  try {
    const url = `${BASE_URL}/${tableName}/records`;

    const records = dataArray.map(data => ({ fields: encryptRecord(tableName, data) }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ records })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
    }

    const json = await res.json();
    return { success: true, data: json.records.map(r => ({ id: r.id, ...decryptRecord(r.fields || {}) })) };

  } catch(err) {
    console.error("Error bulk adding to Grist table:", tableName, err);
    return { success: false, error: err.message };
  }
}
