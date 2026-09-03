# Building PNAP-MIS Mobile App (APK & AAB)

This guide explains how to generate an **APK** (direct install on Android devices) and **AAB** (Google Play Store release) for the PNAP-MIS mobile app, pre-configured to connect to your live Render backend:
**`https://pnap-mis.onrender.com/api`**

---

## 1. Prerequisites (One-Time Setup)

You do **not** need Android Studio or Java installed on your computer. Expo provides free cloud build servers (**EAS Build**) that compile the Android project automatically.

1. Create a free account on [Expo](https://expo.dev/signup) if you don't already have one.
2. In your terminal (from `d:\PNAP-MIS\pnap-mis\mobile` or `d:\PNAP-MIS\pnap-mis`), log in to your Expo account:
   ```bash
   npx eas-cli login
   ```
3. *(Optional)* If prompted to configure a project ID on expo.dev, run:
   ```bash
   npx eas-cli project:init
   ```

---

## 2. Build Options

### Option A: Build an APK (Install Directly on Android Phones)
An APK file can be downloaded and installed directly on any Android device (or distributed to users via WhatsApp, Google Drive, email, or a download button on your website).

Run this command:
```bash
cd d:\PNAP-MIS\pnap-mis\mobile
npx eas-cli build -p android --profile preview
```
*Or from the `pnap-mis` root:*
```bash
npm run build:mobile:apk
```

**What happens during the build:**
- EAS will ask: *"Generate a new Android Keystore?"* → Press **Enter** (Yes). Expo will manage signing keys securely in the cloud.
- EAS compiles the app on Expo cloud builders.
- Once finished (~5–10 minutes), the terminal will display:
  - A **direct download link** to the `.apk` file.
  - A **QR code** you can scan directly with your Android camera to download and install the app immediately.

---

### Option B: Build an AAB (Google Play Store Release)
An Android App Bundle (.aab) is the required format for publishing your app to the Google Play Console.

Run this command:
```bash
cd d:\PNAP-MIS\pnap-mis\mobile
npx eas-cli build -p android --profile production
```
*Or from the `pnap-mis` root:*
```bash
npm run build:mobile:aab
```

Once completed, you can download the `.aab` file and upload it to the **Google Play Console** under your app release track.

---

## 3. How Environment Variables Work in the Build

In `eas.json`, the profiles are configured with:
```json
"env": {
  "EXPO_PUBLIC_API_BASE_URL": "https://pnap-mis.onrender.com/api"
}
```
This ensures that the app built by EAS is baked with your live Render backend URL and connects to your server without needing local IP configuration.

---

## 4. Monitoring Your Builds

You can see build history, download past APK/AAB files, and view build logs anytime on your Expo dashboard:
[https://expo.dev](https://expo.dev)
