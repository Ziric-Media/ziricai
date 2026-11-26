# Google Play — Sarah TWA upload (Spencer)

> **2026-11-22 check:** Play Console account **@MyPlayc** (Ziric Media / ziricmobile@gmail.com) shows **Account closed** on Policy status — new uploads are blocked until Google reinstates the account or you use a different developer account.

**Package:** `com.ziricai.sarah.twa`  
**AAB (signed with upload key):**  
`mobile/sarah-twa/android/app/build/outputs/bundle/release/app-release.aab`  
**Release APK (trusted sideload only):**  
`mobile/sarah-twa/android/app/build/outputs/apk/release/sarah-release.apk`

## 1. Play Console

1. [Google Play Console](https://play.google.com/console) → Create app → **Sarah**.
2. App name: **Sarah** · Type: App · Free.
3. **Setup → App integrity → App signing** — use **Google Play App Signing** (recommended).
4. **Release → Testing → Internal testing** → Create release → Upload **`app-release.aab`**.
5. Add testers (email list) → Copy **opt-in / testing link** — share that instead of APK files.

## 2. Asset links after first upload

Play re-signs the app. In **App signing**, copy **SHA-256 certificate fingerprint** (App signing key certificate).

```powershell
$env:SARAH_TWA_PLAY_SIGNING_SHA256="AA:BB:..."   # from Play Console
npm run twa:sync-assetlinks
npm run deploy:sarah
npm run verify:twa-assetlinks
```

Keep **upload** and **debug** fingerprints in the list (script adds them automatically when keystore exists).

## 3. Store listing minimum

- **Privacy policy URL:** https://marketing.ziricai.com/sarah-privacy.html (Sarah consumer policy — see `docs/mobile/SARAH_APP_PRIVACY_POLICY.md`; **not** `/privacy.html`)
- **Category:** Lifestyle or Education
- **Contact email** for the developer account
- **Screenshots** — Sarah home + one company chat (phone)
- **Short description:** Personal Sarah — bookings, school enquiries, business chat.

## 4. Signing secrets

Passwords and `.jks` live only on your machine:

`mobile/sarah-twa/android/keystore/SIGNING_CREDENTIALS.local.txt` (gitignored)

Back up the `.jks` and passwords to a password manager — losing them blocks Play updates.

## 5. Rebuild AAB after app changes

```powershell
npm run twa:bundle
# or
cd mobile/sarah-twa/android
.\gradlew.bat bundleRelease
```

Bump `versionCode` in `app/build.gradle` before each Play upload.