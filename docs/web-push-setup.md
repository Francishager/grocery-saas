# Web Push Setup

JibuSales browser notifications use the standard Web Push API. Firebase is not required for push delivery.

## Generate keys

From `backend/`, run:

```sh
npx web-push generate-vapid-keys --json
```

Generate one pair for the deployment. Do not commit the private key or share it in chat. Rotating the pair invalidates existing browser subscriptions; users must subscribe again.

## Configure deployment

Set these Railway backend variables:

```text
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:jibusales00@gmail.com
```

Set the Cloudflare Pages build variable to the exact same public key:

```text
VITE_WEB_PUSH_PUBLIC_KEY=<generated public key>
```

Redeploy the frontend and backend, then sign in and use **Enable push** in the notification panel on each device/browser. Existing Firebase Messaging subscriptions are migrated to the configured VAPID key when the user is signed in and has already granted notification permission.

## Delivery and privacy

Push delivery is targeted to the authenticated user’s registered browser subscriptions. Tenant-wide and platform-wide sends keep their existing permission checks. Lock-screen content is generic; detailed notification records remain in the authenticated app. Delivery is processed for every active subscription in bounded concurrent batches; browsers and their push services may still throttle, expire, or discard notifications.

Push can arrive while the user is logged out as long as the browser subscription remains active and OS/browser notifications are allowed. On iPhone and iPad, Web Push requires iOS/iPadOS 16.4 or later and JibuSales installed on the Home Screen.
