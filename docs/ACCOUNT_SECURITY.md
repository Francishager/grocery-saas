# Account Security Enrollment

JibuSales requires every signed-in account, including existing users and SaaS Admins, to choose a business-switch confirmation method before authenticated pages or APIs are available.

## User Setup

On the next sign-in, the user must either register a passkey or explicitly enable password confirmation. A passkey can prompt for a fingerprint, face recognition, device PIN, or security key, depending on the device. Biometric information remains on the device; JibuSales stores the passkey public key and credential metadata only. When a user switches businesses, the server verifies the passkey assertion or re-checks the account password before issuing the new business session.

If a passkey is unavailable or the user cancels its prompt, they can confirm with their account password. A passkey user can use that same recovery path for a business switch.

## Railway Configuration

For the current JibuSales Cloudflare origin, configure these variables in the backend Railway service:

```env
WEBAUTHN_ORIGIN=https://jibusales.jibusales00.workers.dev
WEBAUTHN_RP_ID=jibusales.jibusales00.workers.dev
```

`WEBAUTHN_ORIGIN` is the exact HTTPS app origin (scheme included). `WEBAUTHN_RP_ID` is its hostname only. If JibuSales moves to another domain, update both values to the user-facing domain before asking users to enroll passkeys there. Existing passkeys remain scoped to the origin where they were registered; users can still use password confirmation if they move to a different domain.

The Railway startup bootstrap adds the nullable user security fields and the passkey/challenge tables without changing business records. The backend build regenerates Prisma Client from the updated schema.
