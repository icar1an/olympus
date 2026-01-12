# Prometheus Chrome Extension - Publishing Guide

## Pre-Publishing Checklist ✅

### ✅ Completed Items
- [x] **Manifest v3** - Using latest manifest version
- [x] **Icons** - All required sizes (16x16, 48x48, 128x128)
- [x] **Privacy Policy** - Located at `PRIVACY_POLICY.md`
- [x] **README** - Comprehensive documentation
- [x] **Core Files** - popup.html, popup.js, background.js, content.js, styles.css
- [x] **Permissions** - Clearly defined and justified
- [x] **OAuth configured** - Google OAuth2 with client ID
- [x] **Firebase integration** - Cloud Functions deployed

### ⚠️ Items to Address Before Publishing

1. **Update Privacy Policy Contact Email**
   - Open `PRIVACY_POLICY.md` line 87
   - Replace `[your-email@example.com]` with your actual email

2. **Console.log Statements** (Optional cleanup)
   - The extension contains console.log statements for debugging
   - These are acceptable for v1.0.0 but consider removing for production

3. **Pinterest Integration**
   - Currently marked as "In Development" - this is correctly exposed in the UI
   - Ensure Pinterest trial mode test users are configured if needed

---

## Chrome Web Store Requirements

### Required Assets

| Asset | Dimensions | Format | Status |
|-------|------------|--------|--------|
| Extension Icon (small) | 16x16 | PNG | ✅ Ready |
| Extension Icon (medium) | 48x48 | PNG | ✅ Ready |
| Extension Icon (large) | 128x128 | PNG | ✅ Ready |
| Store Icon | 128x128 | PNG | ✅ Use existing |
| Promotional Image (small) | 440x280 | PNG/JPG | ❌ Need to create |
| Promotional Image (large) | 1400x560 | PNG/JPG | ❌ Optional |
| Screenshots | 1280x800 or 640x400 | PNG/JPG | ❌ Need to capture |

### Screenshots to Capture

1. **Home View** - Show the elegant dark-to-light gradient header with action cards
2. **Analysis Results** - Display a fashion analysis with aesthetic breakdown
3. **Shareable Card** - Show the card generation feature
4. **Saved Aesthetics** - Display the collections view

---

## Publishing Steps

### Step 1: Create Your Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay the one-time $5 developer registration fee
3. Complete account verification

### Step 2: Prepare the ZIP File

A ready-to-upload ZIP file has been created at:
```
/Users/sfw/Desktop/prometheus-extension-v1.0.0.zip
```

**Included files:**
- `manifest.json`
- `popup.html`, `popup.js`
- `options.html`, `options.js`
- `background.js`
- `content.js`, `content-styles.css`
- `styles.css`
- `config.js`
- `auth.js`, `firebase.js`, `gemini.js`
- `icons/` folder (all icon sizes)
- `assets/` folder

**Excluded (not needed for publishing):**
- `functions/` (Firebase Cloud Functions - deployed separately)
- `website/` (Marketing website - hosted separately)
- `.claude/` (Development files)
- `README.md`, `PRIVACY_POLICY.md`, `PUBLISHING_GUIDE.md` (documentation)
- `config.template.js`
- `firebase.json`

### Step 3: Upload to Chrome Web Store

1. Go to [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `prometheus-extension-v1.0.0.zip`
4. Fill in store listing details:

**Store Listing Content:**

```
Name: Prometheus

Short Description (132 chars max):
Extract and analyze fashion aesthetics from any image on the web. AI-powered style identification with runway references.

Category: Lifestyle

Language: English
```

**Detailed Description:**
```
Prometheus decodes fashion aesthetics with AI precision.

✨ FEATURES:
• Capture - Click any image on the web to analyze its aesthetic
• Upload - Analyze images from your device  
• Pinterest - Connect your boards for batch analysis
• AI Analysis - Identify aesthetics, key elements, color palettes
• Runway References - Discover historical collections in your style
• Shareable Cards - Create beautiful cards of your discoveries
• Collections - Save and organize your aesthetic library

🎨 POWERED BY AI:
Prometheus uses Google's Gemini AI to provide comprehensive style analysis, identifying:
- Aesthetic name and description
- Key style elements
- Color palette
- Mood and attitude
- Historical runway references

🔒 PRIVACY FOCUSED:
- Images are analyzed in real-time and not stored
- All data saved locally in your browser
- Optional Google sign-in for enhanced features
- No browsing history collected

Built for lovers of dark aesthetics.
```

### Step 4: Privacy Practices

When filling out the privacy practices form:

**Single Purpose Description:**
```
This extension analyzes fashion images to identify aesthetics, providing style breakdowns and historical runway references.
```

**Permission Justifications:**

| Permission | Justification |
|------------|---------------|
| `activeTab` | Required to capture images from the current page when user clicks "Capture" |
| `storage` | Stores user preferences, saved analyses, and authentication tokens locally |
| `scripting` | Injects content script to enable image selection on pages |
| `identity` | Enables Google Sign-In via Chrome's OAuth flow |
| `contextMenus` | Adds "Analyze with Prometheus" right-click option on images |
| `alarms` | Schedules periodic data sync for logged-in users |
| `host_permissions` | Accesses Firebase Auth (googleapis.com) and Cloud Functions (cloudfunctions.net) |

**Content Script Justification (`<all_urls>`):**
```
The content script runs on all URLs to enable the image capture feature. 
Fashion images appear on any website (blogs, social media, retailers), 
so limiting URLs would break core functionality.
```

**Data Usage Disclosure:**
- ✅ User's email address (with Google Sign-In only)
- ✅ User's display name (with Google Sign-In only)
- ❌ Web history
- ❌ User activity
- ❌ Website content (except images user explicitly chooses to analyze)

### Step 5: Submit for Review

1. Upload promotional images and screenshots
2. Set pricing (Free)
3. Select distribution countries
4. Click "Submit for Review"

**Review typically takes 1-3 business days.**

---

## Post-Publishing

### Version Updates

To publish updates:
1. Increment version in `manifest.json`
2. Create new ZIP file
3. Upload to Developer Dashboard
4. Submit for review

### Monitoring

- Check Developer Dashboard for reviews/feedback
- Monitor Firebase Console for function usage
- Track Gemini API quota at Google AI Studio

---

## Support Resources

- [Chrome Web Store Developer Documentation](https://developer.chrome.com/docs/webstore/)
- [Extension Quality Guidelines](https://developer.chrome.com/docs/webstore/program-policies/)
- [Firebase Console](https://console.firebase.google.com/project/prometheus-ext-2026)
- [Google AI Studio](https://aistudio.google.com/)

---

*Good luck with the launch! 🚀*
