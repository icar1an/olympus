# Prometheus Extension Deployment Guide 🚀

This document provides a step-by-step checklist to take Prometheus from local development to the Chrome Web Store.

---

## 1. Final Code Preparation

### 🧹 Cleanup
- [ ] Remove `console.log` statements from production code.
- [ ] Ensure `manifest.json` version is incremented (Current: `1.0.1`).
- [ ] Verify `config.js` is NOT included in the project root if it contains sensitive keys (though for extensions, some keys are public).

### 🔒 Privacy & Safety
- [ ] Review `PRIVACY_POLICY.md` one last time.
- [ ] Ensure all `host_permissions` are strictly necessary.

---

## 2. Store Assets & Listing

### 🖼️ Required Images
| Asset | Dimensions | Note |
|-------|------------|------|
| Icon (small) | 16x16 | `icons/icon16.png` ✅ |
| Icon (medium) | 48x48 | `icons/icon48.png` ✅ |
| Icon (large) | 128x128 | `icons/icon128.png` ✅ |
| Small Tile | 440x280 | **TODO: Required for store** |
| Large Tile | 1400x560 | Optional (Recommended) |
| Screenshots | 1280x800 or 640x400 | At least two required |

### 📝 Listing Copy
**Short Description (132 chars):**
> Extract and analyze fashion aesthetics from any image on the web. AI-powered style identification with runway references.

**Categories:** Lifestyle, Productivity.

---

## 3. Packaging for Production

Run the packaging script to create the `prometheus-dist.zip` file:

```bash
chmod +x package-extension.sh
./package-extension.sh
```

This script excludes:
- `website/` (Marketing site)
- `functions/` (Serverless code)
- `.git/`, `.claude/`, tests, and markdown documentation.

---

## 4. Submission Steps

1. **Dashboard**: Login to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
2. **Registration**: Pay the $5 one-time developer fee if not already done.
3. **New Item**: Click "New Item" and upload `prometheus-dist.zip`.
4. **Extension ID**: Once uploaded, the Store will assign an ID (e.g., `bbgigkg...`). **Do not add this to your manifest.json.**
5. **OAuth Registration**: 
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Select your project.
   - Go to **APIs & Services > Credentials**.
   - Create or Edit your **OAuth 2.0 Client ID** (Application type: "Chrome extension").
   - Enter your **Extension ID** (`bbgigkg...`) in the specific field.
   - Copied the **Client ID** and ensure it matches the one in your `manifest.json`.
6. **Permissions**: Justify `activeTab`, `storage`, `scripting`, `identity`, `contextMenus`, `alarms`, and `host_permissions`.
7. **Review**: Submit! Review usually takes 24-72 hours.

---

## 5. Firebase Production Check

- [ ] Ensure Cloud Functions are deployed to the production project.
- [ ] Update `config.js` `functions.baseUrl` to the production URL.
- [ ] Verify Firebase Auth domain is authorized in the Google Cloud Console.

---


---

## 🛠️ Troubleshooting

### "Key field value in the manifest doesn't match the current item"
This error occurs when your `manifest.json` contains a `"key"` field that doesn't match the ID assigned by the Chrome Web Store.
- **Solution**: We have removed the `key` field from `manifest.json`. The Store will automatically assign a permanent ID upon your first successful upload.

### "Manifest version 2 is deprecated"
- **Solution**: Prometheus is already using Manifest V3. No action required.

---

*Launch time!* 🥂
