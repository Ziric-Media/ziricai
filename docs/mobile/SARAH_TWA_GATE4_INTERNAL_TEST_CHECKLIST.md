# Sarah TWA — Gate 4 internal testing checklist (Play)

**Package:** `com.ziricai.sarah.twa`  
**Web origin:** https://sarah.ziricai.com  
**Asset links (live):** https://sarah.ziricai.com/.well-known/assetlinks.json — **3** fingerprints (debug, Play App Signing, upload)

**Out of scope for this gate:** Production rollout, open testing, promoted release.

**Updates during internal testing:** **`npm run deploy:sarah`** (and Railway for API) reaches Play testers on next app open — **no new Play upload**. Upload a new **AAB** only when the **Android shell** changes (icons, manifest, start URL, `versionCode` bump). If UI looks stale, force-close Sarah or clear site data for `sarah.ziricai.com` (service worker cache).

---

## Spencer — your turn: Play Console (one-time)

1. [Play Console](https://play.google.com/console) → **Sarah** → **Release** → **Testing** → **Internal testing**.
2. Confirm the latest **AAB** is on the internal track (API 36+ build Spencer uploaded).
3. **Testers** → **Create email list** (e.g. `Sarah internal`) → add Gmail addresses for phones you will use (including your own).
4. Copy the **Internal testing opt-in link** (Join on the web → opens Play to install).
5. Paste back here (optional): opt-in URL, `versionCode`, and whether install appeared in Play Store.

---

## Spencer — your turn: device install

1. On the **test phone**, open the **opt-in link** in Chrome (signed into the same Google account as the tester list).
2. Accept invitation → Play Store should show **Sarah** → **Install** (not sideload APK).
3. If Play shows “App not available”, wait 15–30 minutes after release save, or check tester email matches device account.
4. Open **Sarah** from the launcher (not a browser bookmark).

---

## TWA / Digital Asset Links (must pass)

| # | Check | Pass? |
|---|--------|-------|
| 1 | App opens **full-screen** (no obvious browser URL bar on home). | ☐ |
| 2 | No toast/dialog about **Digital Asset Links** / “can't verify” on cold start. | ☐ |
| 3 | Chrome **Settings → sarah.ziricai.com** (or long-press app info) does **not** show “Open in browser” as the only option if TWA is linked (varies by OEM). | ☐ |

If (2) fails: re-fetch https://sarah.ziricai.com/.well-known/assetlinks.json (expect **3** SHAs) and confirm install build is from **Play**, not old sideload APK.

---

## Authentication

| # | Check | Pass? |
|---|--------|-------|
| 4 | **Sign in** with a real Sarah consumer account (Firebase). | ☐ |
| 5 | Sign out → sign in again; session restores without loop errors. | ☐ |
| 6 | Background app → resume; still signed in. | ☐ |

---

## Personal Sarah (core)

| # | Check | Pass? |
|---|--------|-------|
| 7 | **My Sarah** home loads (avatar, greeting, **4** home cards without broken layout). | ☐ |
| 8 | Send a chat message; reply returns (no stuck spinner > ~30s). | ☐ |
| 9 | **No “−X credits”** line under Sarah replies (metering is silent). | ☐ |
| 10 | Bottom of chat: **no large empty gap** above compose bar. | ☐ |

---

## News

| # | Check | Pass? |
|---|--------|-------|
| 11 | **News** tab → briefing loads. | ☐ |
| 12 | Tap a story → **opens immediately** (not long blank wait). | ☐ |
| 13 | Article body is **readable / fuller** than headline-only; back returns to briefing. | ☐ |

---

## Navigation & Discover (smoke)

| # | Check | Pass? |
|---|--------|-------|
| 14 | Bottom nav: **My Sarah, News, Discover, Chats, Profile** — each opens without crash. | ☐ |
| 15 | **Discover** → open a known business (e.g. Babes Car Sales or Smile More) → company chat loads. | ☐ |
| 16 | Company chat: automotive → stock/search behaviour reasonable; dental → reception (not “no inventory” for practice). | ☐ |

---

## Optional — portal (separate from TWA)

Portal Sarah Sales / asset links do **not** block TWA. Only run if you have time on desktop:

- https://app.ziricai.com → **Sarah Sales** → **Sarah** tab responds with diary/inbox tools (Smile More).

---

## Report back to Cursor / Astra

Copy this block filled in:

```
Gate 4 device test — <date>
Phone model + Android version:
Play versionCode installed:
Opt-in: OK / issue: …
TWA full-screen: OK / issue: …
Asset links error: none / text: …
Auth: OK / issue: …
Home + chat: OK / issue: …
News open speed + article: OK / issue: …
Discover company chat: OK / issue: …
```

---

## If something fails

| Symptom | Likely next step |
|---------|------------------|
| Verify apps / asset links | Confirm Play-signed install; live JSON has **E8:BE:9A…** fingerprint. |
| Old UI (credits, slow news) | Force-stop app, clear cache, or uninstall/reinstall from Play (not old APK). |
| Can’t install from Play | Tester email, release rolled out, country/device compatibility. |

**Cursor:** no further deploy unless Spencer reports asset-links or app regressions.