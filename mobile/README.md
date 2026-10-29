# JibuSales Mobile

An Expo React Native app using the existing JibuSales Railway API. The initial release includes secure sign-in, session renewal, permission-filtered business KPIs, enabled-module visibility, pull-to-refresh, and sign-out. It does not yet reproduce all web workflows; sales entry and other operational screens remain future mobile work.

## Run locally

```powershell
cd mobile
npm install
npx expo start
```

The production API defaults to `https://grocery-saas-production-e339.up.railway.app`. To target another API, create `.env.local` from `.env.example` and set `EXPO_PUBLIC_API_URL` before starting/building. This value is public client configuration, not a secret. Authentication tokens are stored with the device secure-storage APIs; passwords are not persisted.

## Build a shareable Android APK

1. Create/sign into an Expo account at [expo.dev](https://expo.dev/).
2. From this directory, run:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile preview --platform android
```

EAS returns a private build page with an APK download link. Share that link with pilot users. They install the APK on Android and may need to permit installation from their browser. No Play Store listing is required for this internal pilot.

## iPhone/iPad pilot

For a small device-registered pilot, run `npx eas-cli@latest device:create` and then `npx eas-cli@latest build --profile preview --platform ios`. An iOS internal build is restricted to registered devices. For a broader pre-store test, create an App Store Connect app and use TestFlight; upload a production iOS build with EAS, then invite testers from App Store Connect. TestFlight is still a beta distribution channel, not a public App Store launch.

## Production services

Keep the existing Railway backend running; the app talks to it directly. Cloudflare continues hosting the web application and does not host this native binary. Each app release is built with EAS and delivered through the APK link or TestFlight. Configure the production API URL in the build environment before building if it differs from the default.
