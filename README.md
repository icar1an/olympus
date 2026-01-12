# Prometheus

**Extract and analyze fashion aesthetics from any image on the web.**

A Chrome extension that decodes fashion aesthetics, providing comprehensive style analysis, historical runway references, and shareable aesthetic cards.

---

## Features

- **Image Capture**: Click any image on the web to analyze its aesthetic
- **Upload Support**: Analyze images from your device
- **Pinterest Integration**: Connect your Pinterest boards for batch analysis
- **URL Analysis**: Paste any image URL for instant analysis
- **Aesthetic Identification**: AI-powered fashion aesthetic detection
- **Runway References**: Historical collection recommendations matching the aesthetic
- **Shareable Cards**: Generate beautiful cards to share your style discoveries
- **Collections**: Save and organize your aesthetic analyses

---

## Installation

### Development Setup

1. Clone or download this repository

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the `prometheus` folder

5. The extension icon should appear in your toolbar

### Configuration

Before the extension will fully function, you need to configure:

#### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)

2. Enable the following services:
   - Cloud Functions
   - Cloud Storage
   - Authentication (optional, for user accounts)

3. Update the configuration in `background.js` and `popup.js`:

```javascript
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};
```

4. Deploy your Firebase Cloud Functions (see `/functions` directory structure below)

#### Pinterest API (Optional)

1. Create a Pinterest Developer App at [developers.pinterest.com](https://developers.pinterest.com)

2. Update the Pinterest configuration in `popup.js`:

```javascript
const CONFIG = {
  pinterest: {
    clientId: 'YOUR_PINTEREST_CLIENT_ID',
    // ...
  }
};
```

---

## Firebase Functions Structure

Create these Cloud Functions to power the analysis features:

```
/functions
  /src
    index.ts
    analyze.ts        // Image aesthetic analysis
    generateCard.ts   // Shareable card generation
    getRunwayReferences.ts  // Historical runway lookup
```

### Example Function Signatures

```typescript
// analyze.ts
export const analyze = functions.https.onCall(async (data) => {
  const { imageUrl } = data;
  // Your AI/ML analysis logic here
  return {
    aestheticName: string,
    summary: string,
    keyElements: string[],
    colorPalette: string[],
    moodAttitude: string,
    confidence: number
  };
});

// generateCard.ts
export const generateCard = functions.https.onCall(async (data) => {
  const { analysis, imageUrl } = data;
  // Generate card image and upload to Storage
  return {
    cardUrl: string,
    imageUrl: string
  };
});

// getRunwayReferences.ts
export const getRunwayReferences = functions.https.onCall(async (data) => {
  const { aestheticName } = data;
  // Query your runway database
  return [
    {
      designer: string,
      collection: string,
      image: string,
      url: string
    }
  ];
});
```

---

## Project Structure

```
prometheus/
├── manifest.json        # Chrome extension manifest
├── popup.html          # Main popup UI
├── popup.js            # Popup interaction logic
├── styles.css          # Main stylesheet
├── background.js       # Service worker
├── content.js          # Page content script
├── content-styles.css  # Content script styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── assets/             # Additional assets
```

---

## Design System

### Colors (Monochrome Palette)

| Name     | Hex       | Usage                    |
|----------|-----------|--------------------------|
| Black    | `#0a0a0a` | Primary text, accents    |
| Charcoal | `#1a1a1a` | Dark backgrounds         |
| Graphite | `#2d2d2d` | Secondary backgrounds    |
| Slate    | `#4a4a4a` | Secondary text           |
| Stone    | `#6b6b6b` | Tertiary text            |
| Silver   | `#9a9a9a` | Disabled states          |
| Ash      | `#c4c4c4` | Borders                  |
| Pearl    | `#e8e8e8` | Light backgrounds        |
| Ivory    | `#f5f5f5` | Card backgrounds         |
| White    | `#fafafa` | Primary background       |

### Typography

- **Serif**: Cormorant Garamond (headings, brand)
- **Sans**: Inter (body, UI elements)

---

## Usage

### Analyzing an Image

1. Click the Prometheus icon in your toolbar
2. Choose your input method:
   - **Capture**: Click any image on the current page
   - **Upload**: Select an image from your device
   - **Paste URL**: Enter a direct image URL
   - **Pinterest**: Connect and select from your boards
3. Wait for the AI analysis to complete
4. View the aesthetic breakdown, including:
   - Aesthetic name and description
   - Key style elements
   - Color palette
   - Mood and attitude
   - Historical runway references

### Creating a Shareable Card

1. After analyzing an image, click "Create shareable card"
2. Preview the generated card
3. Download as an image or copy the shareable link

### Saving Analyses

- Click the bookmark icon to save any analysis
- Access saved analyses from the "Saved" tab
- Organize into collections for easy reference

---

## Development

### Running Locally

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Prometheus extension
4. Test your changes

### Building for Production

For production deployment:

1. Update version in `manifest.json`
2. Remove any development console.log statements
3. Minify JS/CSS (optional)
4. Create a ZIP file of the extension directory
5. Submit to Chrome Web Store

---

## API Reference

### Message Actions

The extension uses Chrome message passing for communication:

```javascript
// Analyze an image
chrome.runtime.sendMessage({
  action: 'analyzeImage',
  imageUrl: 'https://...'
});

// Generate a card
chrome.runtime.sendMessage({
  action: 'generateCard',
  analysis: { /* analysis object */ }
});

// Get runway references
chrome.runtime.sendMessage({
  action: 'getRunwayReferences',
  aestheticName: 'Gothic Minimalism'
});
```

---

## License

MIT License - See LICENSE file for details

---

## Credits

Inspired by [Phia](https://phia.app) - Fashion price comparison

Built with ♠ for lovers of dark aesthetics
