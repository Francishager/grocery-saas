# JibuSales Mobile

An Expo React Native container for the existing responsive JibuSales web application. It loads the production Cloudflare Worker site so the mobile app uses the same login, responsive navigation, modules, business permissions, and workflows as the web product. Native configuration supplies device capabilities needed by supported web flows.

## Thermal printers

The mobile receipt flow uses a restricted WebView-to-native bridge for ESC/POS receipt bytes. Android lists paired Bluetooth Classic printers and attached USB printers; Bluetooth printers must first be paired in Android Settings. USB access uses Android's device permission prompt. iOS supports compatible Bluetooth Low Energy printers that expose a writable receipt characteristic. Generic USB thermal printing and Bluetooth Classic SPP are not available to an ordinary iOS app; the receipt's system/browser print option remains the fallback. Printer protocols vary, so validate each target model before rollout.

Native printer code and permissions are included in the app binary. After changing it, create a new EAS build; an OTA update or Cloudflare/Railway deployment cannot add native code to an already-installed app.

## Run locally

```powershell
cd mobile
npm install
npx expo start
```

The app defaults to `https://jibusales.jibusales00.workers.dev`. To target another web origin, create `.env.local` from `.env.example` and set `EXPO_PUBLIC_WEB_APP_URL` before starting/building. This value is public client configuration, not a secret. Authentication and permissions are handled by the existing web app and API.

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
