// backend/cryptoUtils.js
import crypto from "crypto";

const ENC_MARK = "enc:v1";
const ALG = "aes-256-gcm";
const DEFAULT_IV_LEN = 12; // Recommended for GCM

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!raw) return null;

  try {
    // Accept 32-byte hex, base64, or passphrase → sha256 to 32 bytes
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) return Buffer.from(raw, "hex"); // 32-byte hex
    if (/^[A-Za-z0-9+/=]{40,}$/.test(raw)) {
      const b = Buffer.from(raw, "base64");
      // If not 32 bytes, normalize
      return b.length === 32 ? b : crypto.createHash("sha256").update(b).digest();
    }
    // Fallback: hash passphrase to 32 bytes
    return crypto.createHash("sha256").update(raw).digest();
  } catch {
    return null;
  }
}

export function isEncrypted(val) {
  return typeof val === "string" && val.startsWith(ENC_MARK + ":");
}

// Encrypt any JSON-serializable value
export function encrypt(value) {
  const key = getKey();
  if (!key) return value; // no-op if key missing
  if (value === null || value === undefined) return value;
  if (typeof value === "string" && isEncrypted(value)) return value; // avoid double-encryption

  try {
    const plain = Buffer.from(JSON.stringify(value), "utf8");
    const iv = crypto.randomBytes(DEFAULT_IV_LEN);
    const cipher = crypto.createCipheriv(ALG, key, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_MARK}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
  } catch {
    return value; // fail open to avoid data loss
  }
}

// Decrypt if value is enc:v1; otherwise return as-is
export function decrypt(value) {
  const key = getKey();
  if (!key || !isEncrypted(value)) return value;

  try {
    const [, ivb64, tagb64, encb64] = value.split(":");
    const iv = Buffer.from(ivb64, "base64");
    const tag = Buffer.from(tagb64, "base64");
    const enc = Buffer.from(encb64, "base64");

    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    // We always encrypt JSON, so parse it back
    return JSON.parse(dec);
  } catch {
    // If decryption fails (wrong key/legacy data), return original string
    return value;
  }
}