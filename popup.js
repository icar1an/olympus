/**
 * Prometheus - Fashion Aesthetic Analyzer
 * Main popup script
 */

// ============================================
// Configuration
// ============================================

const CONFIG = {
  firebase: {
    // Replace with your Firebase config
    apiKey: 'YOUR_API_KEY',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project',
    storageBucket: 'your-project.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },
  pinterest: {
    clientId: '1531950',
    redirectUri: chrome.identity?.getRedirectURL() || '',
    scope: 'boards:read,pins:read,user_accounts:read'
  },
  functions: {
    baseUrl: 'https://us-central1-prometheus-ext-2026.cloudfunctions.net',
    exchangePinterestTokenUrl: 'https://us-central1-prometheus-ext-2026.cloudfunctions.net/exchangePinterestToken',
    getPinterestBoardsUrl: 'https://us-central1-prometheus-ext-2026.cloudfunctions.net/getPinterestBoards',
    getPinterestBoardPinsUrl: 'https://us-central1-prometheus-ext-2026.cloudfunctions.net/getPinterestBoardPins'
  },
  endpoints: {
    analyze: '/analyze',
    generateCard: '/generateCard',
    getRunwayReferences: '/getRunwayReferences'
  }
};

// ============================================
// State Management
// ============================================

const state = {
  currentView: 'homeView',
  currentImage: null,
  currentAnalysis: null,
  pinterestToken: null,
  pinterestBoards: [],
  currentBoard: null,
  boardAnalysisResults: null,
  boardAnalysisProgress: { current: 0, total: 0 },
  boardAnalyzedImages: [],  // Image URLs for collage display
  recentAnalyses: [],  // Auto-saved recent analyses
  savedAnalyses: [],   // User-saved analyses
  savedBoardAnalyses: [],  // User-saved board analyses
  recentBoardAnalyses: [],  // Auto-saved recent board analyses
  collections: [],
  captureTabId: null,
  user: null,
  isAuthenticated: false
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Views
  homeView: document.getElementById('homeView'),
  analysisView: document.getElementById('analysisView'),
  collectionsView: document.getElementById('collectionsView'),
  cardView: document.getElementById('cardView'),
  pinterestView: document.getElementById('pinterestView'),
  boardAnalysisView: document.getElementById('boardAnalysisView'),

  // Buttons
  captureBtn: document.getElementById('captureBtn'),
  uploadBtn: document.getElementById('uploadBtn'),
  pinterestBtn: document.getElementById('pinterestBtn'),
  backBtn: document.getElementById('backBtn'),
  cardBackBtn: document.getElementById('cardBackBtn'),
  pinterestBackBtn: document.getElementById('pinterestBackBtn'),
  boardAnalysisBackBtn: document.getElementById('boardAnalysisBackBtn'),
  createCardBtn: document.getElementById('createCardBtn'),
  saveBtn: document.getElementById('saveBtn'),
  connectPinterestBtn: document.getElementById('connectPinterestBtn'),
  downloadCardBtn: document.getElementById('downloadCardBtn'),
  copyLinkBtn: document.getElementById('copyLinkBtn'),
  accountBtn: document.getElementById('accountBtn'),

  // Navigation
  navHome: document.getElementById('navHome'),
  navCollections: document.getElementById('navCollections'),
  viewAllBtn: document.getElementById('viewAllBtn'),

  // Analysis elements
  analyzedImage: document.getElementById('analyzedImage'),
  loadingState: document.getElementById('loadingState'),
  analysisResults: document.getElementById('analysisResults'),
  aestheticTitle: document.getElementById('aestheticTitle'),
  aestheticSummary: document.getElementById('aestheticSummary'),
  coreGarments: document.getElementById('coreGarments'),
  runwayList: document.getElementById('runwayList'),
  analysisContent: document.getElementById('analysisContent'),

  // Card elements
  shareableCard: document.getElementById('shareableCard'),
  cardUserName: document.getElementById('cardUserName'),
  cardImageArea: document.getElementById('cardImageArea'),
  cardAestheticName: document.getElementById('cardAestheticName'),
  cardDescription: document.getElementById('cardDescription'),
  cardBrand: document.getElementById('cardBrand'),
  cardRefsSection: document.getElementById('cardRefsSection'),
  cardRefsList: document.getElementById('cardRefsList'),

  // Board card elements
  boardCardView: document.getElementById('boardCardView'),
  boardCardBackBtn: document.getElementById('boardCardBackBtn'),
  boardShareableCard: document.getElementById('boardShareableCard'),
  boardCardUserName: document.getElementById('boardCardUserName'),
  boardCardPinCount: document.getElementById('boardCardPinCount'),
  boardCardAestheticName: document.getElementById('boardCardAestheticName'),
  boardCardDescription: document.getElementById('boardCardDescription'),
  boardCardBreakdownList: document.getElementById('boardCardBreakdownList'),
  downloadBoardCardBtn: document.getElementById('downloadBoardCardBtn'),
  copyBoardCardBtn: document.getElementById('copyBoardCardBtn'),

  // Pinterest elements
  pinterestBoards: document.getElementById('pinterestBoards'),
  boardsList: document.getElementById('boardsList'),
  disconnectPinterestBtn: document.getElementById('disconnectPinterestBtn'),

  // Other
  fileInput: document.getElementById('fileInput'),
  recentList: document.getElementById('recentList'),
  savedList: document.getElementById('savedList'),
  imagePreview: document.getElementById('imagePreview'),

  // Auth
  signInOverlay: document.getElementById('signInOverlay'),
  googleSignInBtn: document.getElementById('googleSignInBtn')
};

// ============================================
// View Management
// ============================================

function showView(viewId) {
  // Hide all views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  // Show target view
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
    state.currentView = viewId;
  }

  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  if (viewId === 'homeView') {
    elements.navHome.classList.add('active');
    // Refresh recent list from storage when navigating to home
    // Small delay to ensure any pending saves complete first
    setTimeout(() => loadSavedAnalyses(), 100);
  } else if (viewId === 'collectionsView') {
    elements.navCollections.classList.add('active');
    // Refresh saved and recent lists from storage when navigating to collections
    // Small delay to ensure any pending saves complete first
    setTimeout(() => loadSavedAnalyses(), 100);
  }
}

// ============================================
// Image Handling
// ============================================

function handleImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const imageUrl = e.target.result;

    // Show analysis view with loading state
    showView('analysisView');
    elements.analyzedImage.src = imageUrl;
    elements.loadingState.classList.add('active');
    elements.analysisResults.classList.remove('active');

    // Send to background for persistent analysis
    chrome.runtime.sendMessage({
      action: 'startImageAnalysis',
      imageUrl: imageUrl
    }, (response) => {
      if (response?.success) {
        // Start polling for results
        startImageAnalysisPolling();
      } else {
        showToast(response?.error || 'Failed to start analysis');
        showView('homeView');
      }
    });
  };
  reader.readAsDataURL(file);
}

function handleImageUrl(url) {
  console.log('Prometheus popup: handleImageUrl called with:', url?.substring(0, 80));
  if (!url || !isValidUrl(url)) {
    // Check if it's a data URL (base64)
    if (url && url.startsWith('data:')) {
      console.log('Prometheus popup: Processing as data URL');
      state.currentImage = url;
      startAnalysis(url);
      return;
    }
    showToast('Please enter a valid URL');
    return;
  }

  state.currentImage = url;
  startAnalysis(url);
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================
// Analysis Functions
// ============================================

let isAnalyzing = false; // Guard to prevent duplicate analyses

async function startAnalysis(imageSource) {
  // Prevent duplicate analyses
  if (isAnalyzing) {
    console.log('Prometheus popup: Analysis already in progress, skipping');
    return;
  }

  isAnalyzing = true;
  console.log('Prometheus popup: startAnalysis called');
  showView('analysisView');

  // Set image preview
  elements.analyzedImage.src = imageSource;

  // Show loading
  elements.loadingState.classList.add('active');
  elements.analysisResults.classList.remove('active');

  try {
    // Check if this image was already analyzed (deduplication)
    const existingResult = await chrome.storage.local.get(['recentAnalyses']);
    const existingAnalyses = existingResult.recentAnalyses || [];
    const existingAnalysis = existingAnalyses.find(item => item.image === imageSource);

    let analysis;
    if (existingAnalysis) {
      // Use cached analysis
      console.log('Prometheus popup: Using cached analysis for image');
      analysis = existingAnalysis.analysis;
    } else {
      // Call Gemini analysis via background service
      console.log('Prometheus popup: Calling analyzeAesthetic...');
      analysis = await analyzeAesthetic(imageSource);
      console.log('Prometheus popup: Analysis received:', analysis?.aestheticName);
    }

    state.currentAnalysis = analysis;

    // Get runway references (use Gemini's if available)
    const references = await getRunwayReferences(analysis.aestheticName, analysis.runwayReferences);

    // Update UI with results
    displayAnalysisResults(analysis, references);

    // Auto-save the analysis (only saves if not already in recent)
    await autoSaveAnalysis();
  } catch (error) {
    console.error('Prometheus popup: Analysis error:', error);
    showToast(error.message || 'Analysis failed. Please try again.');
    showView('homeView');
  } finally {
    elements.loadingState.classList.remove('active');
    isAnalyzing = false; // Reset guard
  }
}

async function analyzeAesthetic(imageSource) {
  // Use the background service worker to analyze the image via Gemini
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'analyzeImage', imageUrl: imageSource },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response?.success) {
          resolve(response.data);
        } else {
          const errorMsg = response?.error || 'Analysis failed';
          reject(new Error(errorMsg));
        }
      }
    );
  });
}

// Helper to generate fallback SVG for designer initials
function generateFallbackSvg(designer) {
  const initials = designer.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><rect fill="#1a1a1a" width="52" height="52" rx="10"/><text x="26" y="31" fill="#ffffff" font-family="Georgia, serif" font-size="18" font-weight="500" text-anchor="middle">${initials}</text></svg>`)}`;
}

// Helper to construct Vogue runway image URL
function constructRunwayImageUrl(designer, collection) {
  // Normalize designer name for URL (e.g., "Alexander McQueen" -> "alexander-mcqueen")
  const designerSlug = designer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Parse collection (e.g., "Spring/Summer 2016" -> "spring-2016-ready-to-wear")
  const collectionMatch = collection.match(/(spring|fall|resort|pre-fall)?\/?\s*(summer|winter)?\s*(\d{4})/i);
  if (collectionMatch) {
    const season = (collectionMatch[1] || collectionMatch[2] || 'spring').toLowerCase();
    const year = collectionMatch[3];
    return `https://assets.vogue.com/photos/fashion-shows/${designerSlug}-${season}-${year}-ready-to-wear/collection/1.jpg`;
  }

  // Generic fallback URL pattern
  return `https://assets.vogue.com/photos/fashion-shows/${designerSlug}/collection/1.jpg`;
}

// Helper to construct Vogue fashion show page URL
// Format: https://www.vogue.com/fashion-shows/fall-2022-ready-to-wear/miu-miu
function constructVogueShowUrl(designer, collection) {
  const designerSlug = designer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Parse collection string to extract season and year
  // Handles: "Fall 2022", "Spring/Summer 2023", "Fall/Winter 2024", "Resort 2025", "Pre-Fall 2024"
  const collectionLower = collection.toLowerCase();

  // Extract year
  const yearMatch = collection.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : null;

  if (!year) {
    // Fallback to search if we can't parse
    return `https://www.vogue.com/fashion-shows?q=${encodeURIComponent(designer + ' ' + collection)}`;
  }

  // Determine season slug
  let seasonSlug;
  if (collectionLower.includes('resort')) {
    seasonSlug = 'resort';
  } else if (collectionLower.includes('pre-fall') || collectionLower.includes('prefall')) {
    seasonSlug = 'pre-fall';
  } else if (collectionLower.includes('fall') || collectionLower.includes('autumn') || collectionLower.includes('winter')) {
    seasonSlug = 'fall';
  } else if (collectionLower.includes('spring') || collectionLower.includes('summer')) {
    seasonSlug = 'spring';
  } else {
    // Default to spring if unclear
    seasonSlug = 'spring';
  }

  // Construct URL: https://www.vogue.com/fashion-shows/fall-2022-ready-to-wear/miu-miu
  return `https://www.vogue.com/fashion-shows/${seasonSlug}-${year}-ready-to-wear/${designerSlug}`;
}

async function getRunwayReferences(aestheticName, existingReferences = null) {
  // If we already have references from the Gemini analysis, use those
  if (existingReferences && existingReferences.length > 0) {
    return existingReferences.map(ref => {
      // Try to construct a real Vogue runway image URL; fallback SVG will be used on error
      const vogueImageUrl = constructRunwayImageUrl(ref.designer, ref.collection);
      const fallbackSvg = generateFallbackSvg(ref.designer);

      return {
        designer: ref.designer,
        collection: ref.collection,
        image: vogueImageUrl,
        fallbackImage: fallbackSvg,
        url: constructVogueShowUrl(ref.designer, ref.collection)
      };
    });
  }

  // Fallback: Use background service
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getRunwayReferences', aestheticName },
      (response) => {
        if (response?.success) {
          resolve(response.data);
        } else {
          // Return empty array on error rather than failing
          resolve([]);
        }
      }
    );
  });
}

function displayAnalysisResults(analysis, references) {
  // Aesthetic title and summary
  elements.aestheticTitle.textContent = analysis.aestheticName;
  elements.aestheticSummary.textContent = analysis.summary;

  // Core garments to shop for
  if (analysis.coreGarments && analysis.coreGarments.length > 0) {
    elements.coreGarments.innerHTML = analysis.coreGarments
      .map(garment => `<li class="garment-item"><span class="garment-icon">•</span>${garment}</li>`)
      .join('');
  } else {
    elements.coreGarments.innerHTML = '';
  }

  // Runway references - simple text format grouped by designer
  const designerMap = new Map();
  references.forEach(ref => {
    if (!designerMap.has(ref.designer)) {
      designerMap.set(ref.designer, []);
    }
    designerMap.get(ref.designer).push(ref.collection);
  });

  elements.runwayList.innerHTML = Array.from(designerMap.entries()).map(([designer, collections]) => {
    const collectionsText = [...new Set(collections.map(c => formatCollection(c)))].slice(0, 3).join(', ');
    return `
      <div class="designer-item">
        <span class="designer-name">${designer}</span>
        <span class="designer-count">${collectionsText}</span>
      </div>
    `;
  }).join('');

  // Show results
  elements.analysisResults.classList.add('active');

  // Update save button state based on whether this image is already saved
  updateImageSaveButtonState();
}

// ============================================
// Card Generation
// ============================================

async function createShareableCard() {
  if (!state.currentAnalysis) {
    showToast('No analysis to create card from');
    return;
  }

  showView('cardView');

  // Set user name from Firebase auth or default
  const userName = state.user?.displayName || state.user?.email?.split('@')[0] || 'Your';
  elements.cardUserName.textContent = `${userName}'s Style Profile`;

  // Set card image (convert to data URL for html2canvas compatibility)
  const imageDataUrl = await imageUrlToDataUrl(state.currentImage);
  elements.cardImageArea.style.backgroundImage = `url(${imageDataUrl})`;

  // Set aesthetic content
  elements.cardAestheticName.textContent = state.currentAnalysis.aestheticName;

  // Hide description element (removed aesthetic description from card)
  if (elements.cardDescription) {
    elements.cardDescription.style.display = 'none';
  }

  // Populate historical references as text-forward list grouped by designer
  const refs = state.currentAnalysis.runwayReferences || [];
  if (refs.length > 0) {
    // Group by designer
    const designerMap = new Map();
    refs.forEach(ref => {
      if (!designerMap.has(ref.designer)) {
        designerMap.set(ref.designer, []);
      }
      designerMap.get(ref.designer).push(ref.collection);
    });

    elements.cardRefsList.innerHTML = Array.from(designerMap.entries()).slice(0, 5).map(([designer, collections]) => {
      const collectionsText = [...new Set(collections.map(c => formatCollection(c)))].slice(0, 3).join(', ');
      return `
        <div class="card-ref-item-text">
          <span class="card-ref-designer-text">${designer}</span>
          <span class="card-ref-collection-text">${collectionsText}</span>
        </div>
      `;
    }).join('');
    elements.cardRefsSection.style.display = 'block';
  } else {
    elements.cardRefsSection.style.display = 'none';
  }
}

async function downloadCard() {
  if (!state.currentAnalysis || !state.currentImage) {
    showToast('No card to download');
    return;
  }

  showToast('Generating card...');

  try {
    const cardElement = elements.shareableCard;

    // Wait for any images to finish loading
    const images = cardElement.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create export wrapper for off-white background and drop shadow
    const exportWrapper = document.createElement('div');
    exportWrapper.className = 'shareable-card-export-wrapper';

    // Clone the card into the wrapper (to avoid DOM manipulation issues)
    const cardClone = cardElement.cloneNode(true);
    exportWrapper.appendChild(cardClone);
    document.body.appendChild(exportWrapper);

    // Use html2canvas to capture the wrapper (card + background)
    const canvas = await html2canvas(exportWrapper, {
      scale: 3, // High resolution
      useCORS: true,
      backgroundColor: null, // Use wrapper's background
      logging: false,
      imageTimeout: 15000
    });

    // Clean up wrapper
    document.body.removeChild(exportWrapper);

    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('Failed to generate image');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `prometheus-${state.currentAnalysis.aestheticName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('Card downloaded!');
    }, 'image/png');

  } catch (error) {
    console.error('Error generating card:', error);
    showToast('Failed to download card');
  }
}

// Helper function to convert image URL to data URL for html2canvas compatibility
async function imageUrlToDataUrl(url) {
  if (!url || url.startsWith('data:')) {
    return url;
  }

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting image to data URL:', error);
    return url; // Return original URL as fallback
  }
}

// Helper function to wrap text for canvas
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Helper function to truncate text with ellipsis
function truncateWithEllipsis(ctx, text, maxWidth) {
  const ellipsis = '...';
  const ellipsisWidth = ctx.measureText(ellipsis).width;

  // If text already fits, return it
  if (ctx.measureText(text).width <= maxWidth) {
    return text + ellipsis;
  }

  // Remove characters until it fits with ellipsis
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  // Trim trailing spaces and punctuation before ellipsis
  truncated = truncated.replace(/[\s,.:;!?]+$/, '');

  return truncated + ellipsis;
}

// ============================================
// Board Card Generation
// ============================================

async function createBoardShareableCard() {
  if (!state.boardAnalysisResults || !state.currentBoard) {
    showToast('No board analysis to create card from');
    return;
  }

  showView('boardCardView');

  const analysis = state.boardAnalysisResults;
  const imageUrls = state.boardAnalyzedImages || [];

  // Set user name from Firebase auth or default
  const userName = state.user?.displayName || state.user?.email?.split('@')[0] || 'Your';
  elements.boardCardUserName.textContent = `${userName}'s Board Profile`;

  // Render collage or fallback to Pinterest icon
  const imageAreaEl = document.getElementById('boardCardImageArea');
  if (imageAreaEl) {
    if (imageUrls.length > 0) {
      // Display collage (convert to data URLs for html2canvas compatibility)
      const collageCount = Math.min(imageUrls.length, 8);
      const dataUrls = await Promise.all(
        imageUrls.slice(0, 8).map(url => imageUrlToDataUrl(url))
      );
      imageAreaEl.className = 'card-image-area card-image-area--collage';
      imageAreaEl.innerHTML = `
        <div class="board-image-collage" data-count="${collageCount}">
          ${dataUrls.map((url, i) => `<img src="${url}" alt="Pin ${i + 1}">`).join('')}
        </div>
      `;
    } else {
      // Fallback to Pinterest icon
      imageAreaEl.className = 'card-image-area card-image-area--board';
      imageAreaEl.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
        </svg>
      `;
    }
  }

  // Set aesthetic content
  elements.boardCardAestheticName.textContent = analysis.dominantAesthetic;

  // Hide description element (removed "Also featuring" section)
  if (elements.boardCardDescription) {
    elements.boardCardDescription.style.display = 'none';
  }

  // Populate designer references with collections
  if (analysis.topDesigners && analysis.topDesigners.length > 0) {
    elements.boardCardBreakdownList.innerHTML = analysis.topDesigners.slice(0, 4).map(d => {
      const collectionsText = d.collections && d.collections.length > 0
        ? d.collections.slice(0, 3).map(c => formatCollection(c)).join(', ')
        : `${d.count} ${d.count === 1 ? 'reference' : 'references'}`;
      return `
        <div class="card-breakdown-item">
          <span class="breakdown-name">${d.designer}</span>
          <span class="breakdown-count">${collectionsText}</span>
        </div>
      `;
    }).join('');
  }
}

// Helper function to draw rounded rectangle
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Helper function to load image with CORS handling
function loadImageForCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Try without CORS as fallback
      const img2 = new Image();
      img2.onload = () => resolve(img2);
      img2.onerror = reject;
      img2.src = url;
    };
    img.src = url;
  });
}

async function generateBoardCardCanvas() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const analysis = state.boardAnalysisResults;
  const imageUrls = state.boardAnalyzedImages || [];

  // Card dimensions (3x for high resolution)
  const scale = 3;
  const outerPadding = 24 * scale; // Padding around the card
  const cardWidth = 380 * scale;
  const cardRadius = 8 * scale;
  const innerPadding = 24 * scale;

  // Calculate collage dimensions - use portrait cells matching Pinterest image proportions
  const imageCount = Math.min(imageUrls.length, 8);
  let collageHeight = 0;
  let collageRows = 0;
  let collageCols = 0;
  let imageCellWidth = 0;
  let imageCellHeight = 0;
  if (imageCount > 0) {
    collageRows = imageCount <= 4 ? 1 : 2;
    collageCols = collageRows === 1 ? imageCount : 4;
    // Use portrait cells with 3:4 aspect ratio (width:height) to match Pinterest images
    // Calculate cell width first, then derive height from aspect ratio
    imageCellWidth = Math.floor(cardWidth / collageCols);
    imageCellHeight = Math.floor(imageCellWidth * 4 / 3); // Portrait: height > width
    collageHeight = imageCellHeight * collageRows;
  }

  // Content measurements
  const contentPadding = 20 * scale;
  const brandHeight = 16 * scale;
  const brandSpacing = 4 * scale;
  const titleHeight = 32 * scale;
  const breakdownItemHeight = 32 * scale;
  const breakdownGap = 4 * scale;
  const breakdownCount = Math.min(analysis.topDesigners?.length || 0, 4);
  const breakdownHeight = breakdownCount > 0
    ? breakdownCount * breakdownItemHeight + (breakdownCount - 1) * breakdownGap + 16 * scale
    : 0;
  const footerHeight = 36 * scale;

  const contentHeight = contentPadding + brandHeight + brandSpacing + titleHeight + breakdownHeight;
  const cardHeight = collageHeight + contentHeight + footerHeight;

  // Total canvas size includes outer padding and shadow space
  const canvasWidth = cardWidth + outerPadding * 2;
  const canvasHeight = cardHeight + outerPadding * 2;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // === OFF-WHITE BACKGROUND ===
  ctx.fillStyle = '#F5F5F0';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // === DROP SHADOW ===
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 16 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4 * scale;

  // Draw card background with rounded corners
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, outerPadding, outerPadding, cardWidth, cardHeight, cardRadius);
  ctx.fill();
  ctx.restore();

  // Clip to rounded rectangle for content
  ctx.save();
  drawRoundedRect(ctx, outerPadding, outerPadding, cardWidth, cardHeight, cardRadius);
  ctx.clip();

  // === IMAGE COLLAGE ===
  if (imageCount > 0) {
    // Load all images
    const loadedImages = await Promise.all(
      imageUrls.slice(0, 8).map(url => loadImageForCanvas(url).catch(() => null))
    );

    loadedImages.forEach((img, i) => {
      if (!img) return;
      const row = Math.floor(i / collageCols);
      const col = i % collageCols;
      const x = outerPadding + col * imageCellWidth;
      const y = outerPadding + row * imageCellHeight;

      // Draw image with cover fit - maintain aspect ratio and crop
      const imgAspect = img.width / img.height;
      const cellAspect = imageCellWidth / imageCellHeight;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;

      if (imgAspect > cellAspect) {
        // Image is wider than cell - crop horizontally from center
        sw = img.height * cellAspect;
        sx = (img.width - sw) / 2;
      } else {
        // Image is taller than cell - crop from TOP to preserve bottom (show feet/shoes)
        sh = img.width / cellAspect;
        sy = img.height - sh; // Start from bottom of image to show feet
      }

      ctx.drawImage(img, sx, sy, sw, sh, x, y, imageCellWidth, imageCellHeight);
    });
  }

  ctx.restore();

  // === CONTENT AREA ===
  const contentStartY = outerPadding + collageHeight + contentPadding;
  let textY = contentStartY;

  // "prometheus" brand label
  ctx.font = `italic 400 ${14 * scale}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillStyle = '#888888';
  ctx.fillText('prometheus', outerPadding + innerPadding, textY + 12 * scale);
  textY += brandHeight + brandSpacing;

  // Aesthetic name
  ctx.font = `400 ${26 * scale}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillStyle = '#1A1A1A';
  ctx.fillText(analysis.dominantAesthetic, outerPadding + innerPadding, textY + 24 * scale);
  textY += titleHeight + 4 * scale;

  // === DESIGNER REFERENCES ===
  if (breakdownCount > 0) {
    (analysis.topDesigners || []).slice(0, 4).forEach((d, i) => {
      const itemY = textY + i * (breakdownItemHeight + breakdownGap);
      const maxWidth = cardWidth - innerPadding * 2;

      // Dividing line before each item (except first)
      if (i > 0) {
        ctx.strokeStyle = '#E8E8E8';
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.moveTo(outerPadding + innerPadding, itemY - breakdownGap / 2);
        ctx.lineTo(outerPadding + cardWidth - innerPadding, itemY - breakdownGap / 2);
        ctx.stroke();
      }

      // Designer name (serif font)
      ctx.font = `500 ${14 * scale}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillStyle = '#1A1A1A';
      let name = d.designer;
      const nameMaxWidth = maxWidth - 140 * scale;
      if (ctx.measureText(name).width > nameMaxWidth) {
        name = truncateWithEllipsis(ctx, name, nameMaxWidth);
      }
      ctx.fillText(name, outerPadding + innerPadding, itemY + 20 * scale);

      // Collections text (sans-serif font)
      ctx.font = `400 ${12 * scale}px Inter, -apple-system, sans-serif`;
      ctx.fillStyle = '#6B6B6B';
      const collectionsText = d.collections && d.collections.length > 0
        ? d.collections.slice(0, 3).map(c => formatCollection(c)).join(', ')
        : `${d.count} ${d.count === 1 ? 'reference' : 'references'}`;
      const collectionsWidth = ctx.measureText(collectionsText).width;
      ctx.fillText(collectionsText, outerPadding + cardWidth - innerPadding - collectionsWidth, itemY + 20 * scale);
    });
  }

  // === FOOTER ===
  const footerY = outerPadding + cardHeight - footerHeight;
  ctx.font = `italic 400 ${14 * scale}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillStyle = '#888888';
  const footerText = 'prometheus.cards';
  const footerTextWidth = ctx.measureText(footerText).width;
  ctx.fillText(footerText, outerPadding + (cardWidth - footerTextWidth) / 2, footerY + footerHeight / 2 + 5 * scale);

  return canvas;
}

async function downloadBoardCard() {
  if (!state.boardAnalysisResults || !state.currentBoard) {
    showToast('No board card to download');
    return;
  }

  showToast('Generating card...');

  try {
    const cardElement = elements.boardShareableCard;

    // Wait for any images to finish loading
    const images = cardElement.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create export wrapper for off-white background and drop shadow
    const exportWrapper = document.createElement('div');
    exportWrapper.className = 'shareable-card-export-wrapper';

    // Clone the card into the wrapper (to avoid DOM manipulation issues)
    const cardClone = cardElement.cloneNode(true);

    // Apply inline styles to collage for html2canvas compatibility
    const collage = cardClone.querySelector('.board-image-collage');
    if (collage) {
      const count = parseInt(collage.dataset.count) || 8;
      // Card width is 380px - calculate heights based on actual column widths
      // to create properly proportioned (square-ish) cells
      let collageHeight, rowHeight, cols;
      if (count <= 2) {
        // 1 or 2 images: single row, each cell is 190px or 380px wide
        collageHeight = 95;
        rowHeight = 95;
        cols = count;
      } else if (count === 4) {
        // 4 images: 2x2 grid, each column is 190px wide, square cells
        collageHeight = 380;
        rowHeight = 190;
        cols = 2;
      } else if (count === 8) {
        // 8 images: 4x2 grid, each column is 95px wide, portrait cells (~2:3 ratio)
        collageHeight = 280;
        rowHeight = 140;
        cols = 4;
      } else {
        // 3, 5, 6, 7 images: various layouts, use 3:2 aspect ratio
        collageHeight = 254;
        rowHeight = 127;
        cols = count <= 3 ? 2 : (count <= 6 ? 3 : 4);
      }

      collage.style.height = `${collageHeight}px`;
      collage.style.aspectRatio = 'unset';
      collage.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      if (count > 2) {
        collage.style.gridTemplateRows = `${rowHeight}px ${rowHeight}px`;
      } else {
        collage.style.gridTemplateRows = `${rowHeight}px`;
      }

      // Force images to fill cells exactly
      const imgs = collage.querySelectorAll('img');
      imgs.forEach(img => {
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.minHeight = '0';
        img.style.maxHeight = '100%';
      });
    }

    exportWrapper.appendChild(cardClone);
    document.body.appendChild(exportWrapper);

    // Use html2canvas to capture the wrapper (card + background)
    const canvas = await html2canvas(exportWrapper, {
      scale: 3, // High resolution
      useCORS: true,
      backgroundColor: null, // Use wrapper's background
      logging: false,
      imageTimeout: 15000
    });

    // Clean up wrapper
    document.body.removeChild(exportWrapper);

    // Download
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('Failed to generate image');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `prometheus-board-${state.currentBoard.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('Card downloaded!');
    }, 'image/png');

  } catch (error) {
    console.error('Error generating board card:', error);
    showToast('Failed to download card');
  }
}

async function copyBoardCard() {
  if (!state.boardAnalysisResults || !state.currentBoard) {
    showToast('No board card to copy');
    return;
  }

  showToast('Copying card...');

  try {
    const cardElement = elements.boardShareableCard;

    // Wait for any images to finish loading
    const images = cardElement.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create export wrapper for off-white background and drop shadow
    const exportWrapper = document.createElement('div');
    exportWrapper.className = 'shareable-card-export-wrapper';

    // Clone the card into the wrapper (to avoid DOM manipulation issues)
    const cardClone = cardElement.cloneNode(true);

    // Apply inline styles to collage for html2canvas compatibility
    const collage = cardClone.querySelector('.board-image-collage');
    if (collage) {
      const count = parseInt(collage.dataset.count) || 8;
      // Card width is 380px - calculate heights based on actual column widths
      // to create properly proportioned (square-ish) cells
      let collageHeight, rowHeight, cols;
      if (count <= 2) {
        // 1 or 2 images: single row, each cell is 190px or 380px wide
        collageHeight = 95;
        rowHeight = 95;
        cols = count;
      } else if (count === 4) {
        // 4 images: 2x2 grid, each column is 190px wide, square cells
        collageHeight = 380;
        rowHeight = 190;
        cols = 2;
      } else if (count === 8) {
        // 8 images: 4x2 grid, each column is 95px wide, portrait cells (~2:3 ratio)
        collageHeight = 280;
        rowHeight = 140;
        cols = 4;
      } else {
        // 3, 5, 6, 7 images: various layouts, use 3:2 aspect ratio
        collageHeight = 254;
        rowHeight = 127;
        cols = count <= 3 ? 2 : (count <= 6 ? 3 : 4);
      }

      collage.style.height = `${collageHeight}px`;
      collage.style.aspectRatio = 'unset';
      collage.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      if (count > 2) {
        collage.style.gridTemplateRows = `${rowHeight}px ${rowHeight}px`;
      } else {
        collage.style.gridTemplateRows = `${rowHeight}px`;
      }

      // Force images to fill cells exactly
      const imgs = collage.querySelectorAll('img');
      imgs.forEach(img => {
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.minHeight = '0';
        img.style.maxHeight = '100%';
      });
    }

    exportWrapper.appendChild(cardClone);
    document.body.appendChild(exportWrapper);

    // Use html2canvas to capture the wrapper (card + background)
    const canvas = await html2canvas(exportWrapper, {
      scale: 3, // High resolution
      useCORS: true,
      backgroundColor: null, // Use wrapper's background
      logging: false,
      imageTimeout: 15000
    });

    // Clean up wrapper
    document.body.removeChild(exportWrapper);

    // Copy to clipboard
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast('Failed to generate image');
        return;
      }

      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showToast('Card copied to clipboard!');
      } catch (clipboardError) {
        console.log('Image clipboard not supported:', clipboardError);
        showToast('Clipboard not supported');
      }
    }, 'image/png');

  } catch (error) {
    console.error('Error copying board card:', error);
    showToast('Failed to copy card');
  }
}

async function copyCardLink() {
  if (!state.currentAnalysis || !state.currentImage) {
    showToast('No card to copy');
    return;
  }

  showToast('Copying card...');

  try {
    const cardElement = elements.shareableCard;

    // Wait for any images to finish loading
    const images = cardElement.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create export wrapper for off-white background and drop shadow
    const exportWrapper = document.createElement('div');
    exportWrapper.className = 'shareable-card-export-wrapper';

    // Clone the card into the wrapper (to avoid DOM manipulation issues)
    const cardClone = cardElement.cloneNode(true);
    exportWrapper.appendChild(cardClone);
    document.body.appendChild(exportWrapper);

    // Use html2canvas to capture the wrapper (card + background)
    const canvas = await html2canvas(exportWrapper, {
      scale: 3, // High resolution
      useCORS: true,
      backgroundColor: null, // Use wrapper's background
      logging: false,
      imageTimeout: 15000
    });

    // Clean up wrapper
    document.body.removeChild(exportWrapper);

    // Try to copy image to clipboard
    canvas.toBlob(async (blob) => {
      if (!blob) {
        // Fallback: copy text
        await copyAnalysisAsText();
        return;
      }

      try {
        // Try to copy as image (requires ClipboardItem support)
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showToast('Card copied to clipboard!');
      } catch (clipboardError) {
        console.log('Image clipboard not supported, falling back to text');
        // Fallback: copy analysis text
        await copyAnalysisAsText();
      }
    }, 'image/png');

  } catch (error) {
    console.error('Error copying card:', error);
    // Fallback to text copy
    await copyAnalysisAsText();
  }
}

// Fallback function to copy analysis as text
async function copyAnalysisAsText() {
  if (!state.currentAnalysis) {
    showToast('Nothing to copy');
    return;
  }

  const refs = state.currentAnalysis.runwayReferences?.slice(0, 3).map(r => r.designer).join(', ') || '';
  const textContent = `✨ ${state.currentAnalysis.aestheticName}

${state.currentAnalysis.summary}

${refs ? `See also: ${refs}` : ''}

— Analyzed by Prometheus`;

  try {
    await navigator.clipboard.writeText(textContent);
    showToast('Analysis copied to clipboard!');
  } catch (error) {
    showToast('Failed to copy');
  }
}

// ============================================
// Pinterest Integration
// Using Firebase Cloud Function bypass (iOS-style)
// ============================================

async function connectPinterest() {
  console.log('Pinterest: connectPinterest called');

  // Check if user is authenticated with Firebase first
  if (!state.isAuthenticated) {
    showToast('Please sign in first to connect Pinterest');
    elements.signInOverlay.style.display = 'flex';
    return;
  }

  // Use Firebase Cloud Function as the redirect URI to bypass Pinterest trial mode
  const firebaseCallbackUrl = 'https://us-central1-prometheus-ext-2026.cloudfunctions.net/pinterest_oauth_callback';

  console.log('Pinterest: User is authenticated, using Firebase callback:', firebaseCallbackUrl);
  const authUrl = `https://www.pinterest.com/oauth/?response_type=code&redirect_uri=${encodeURIComponent(firebaseCallbackUrl)}&client_id=${CONFIG.pinterest.clientId}&scope=${CONFIG.pinterest.scope}`;
  console.log('Pinterest: Auth URL:', authUrl);

  try {
    if (chrome.identity) {
      console.log('Pinterest: Launching OAuth flow with Firebase callback...');
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, async (redirectUrl) => {
        console.log('Pinterest: OAuth callback received');
        console.log('Pinterest: redirectUrl:', redirectUrl?.substring(0, 100));
        console.log('Pinterest: lastError:', chrome.runtime.lastError);

        if (chrome.runtime.lastError || !redirectUrl) {
          const errorMsg = chrome.runtime.lastError?.message || 'Unknown error';
          console.error('Pinterest OAuth error:', errorMsg);
          showToast(errorMsg.includes('canceled') ? 'Pinterest connection cancelled' : `Pinterest error: ${errorMsg}`);
          return;
        }

        // Extract token data from URL params (Firebase function redirects back with tokens)
        const url = new URL(redirectUrl);
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');
        const expiresIn = url.searchParams.get('expires_in');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        console.log('Pinterest: Has access_token:', !!accessToken);
        console.log('Pinterest: Has error:', !!error);

        if (error) {
          console.error('Pinterest OAuth error:', error, errorDescription);
          showToast(`Pinterest error: ${errorDescription || error}`);
          return;
        }

        if (accessToken) {
          console.log('Pinterest: Token received from Firebase callback, storing...');

          // Store Pinterest token
          state.pinterestToken = accessToken;
          await chrome.storage.local.set({
            pinterestToken: accessToken,
            pinterestRefreshToken: refreshToken,
            pinterestTokenExpiry: Date.now() + (parseInt(expiresIn || '3600') * 1000)
          });

          showToast('Pinterest connected!');
          console.log('Pinterest: Loading boards...');
          await loadPinterestBoards();
          console.log('Pinterest: Boards loaded');
        } else {
          console.error('Pinterest: No access token in redirect URL. Full URL:', redirectUrl);
          showToast('Failed to get access token from Pinterest');
        }
      });
    } else {
      showToast('OAuth not available in this context');
    }
  } catch (error) {
    console.error('Pinterest auth error:', error);
    showToast('Failed to connect Pinterest');
  }
}

// Legacy function - kept for backwards compatibility but no longer used in new flow
async function exchangePinterestToken(code) {
  console.log('Pinterest: exchangePinterestToken called (legacy)');
  showToast('Connecting to Pinterest...');

  try {
    // Get Firebase ID token for authentication
    console.log('Pinterest: Getting Firebase ID token...');
    const idToken = await getFirebaseIdToken();
    console.log('Pinterest: ID token received:', idToken ? 'yes' : 'no');

    if (!idToken) {
      showToast('Please sign in first');
      return;
    }

    console.log('Pinterest: Calling exchange function at:', CONFIG.functions.exchangePinterestTokenUrl);
    console.log('Pinterest: Using redirect URI:', CONFIG.pinterest.redirectUri);

    const response = await fetch(CONFIG.functions.exchangePinterestTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        code: code,
        redirectUri: CONFIG.pinterest.redirectUri
      })
    });

    console.log('Pinterest: Exchange response status:', response.status);
    const result = await response.json();
    console.log('Pinterest: Exchange result:', result.success ? 'success' : result.error);
    if (result.details) {
      console.log('Pinterest: Error details:', JSON.stringify(result.details));
    }

    if (result.success) {
      // Store Pinterest token
      console.log('Pinterest: Storing token...');
      state.pinterestToken = result.data.accessToken;
      await chrome.storage.local.set({
        pinterestToken: result.data.accessToken,
        pinterestRefreshToken: result.data.refreshToken,
        pinterestTokenExpiry: Date.now() + (result.data.expiresIn * 1000)
      });

      showToast('Pinterest connected!');
      console.log('Pinterest: Loading boards...');
      await loadPinterestBoards();
      console.log('Pinterest: Boards loaded');
    } else {
      throw new Error(result.error || 'Failed to exchange token');
    }
  } catch (error) {
    console.error('Pinterest token exchange error:', error);
    showToast(error.message || 'Failed to connect Pinterest');
  }
}

async function getFirebaseIdToken() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getIdToken' }, (response) => {
      if (response?.success) {
        resolve(response.idToken);
      } else {
        resolve(null);
      }
    });
  });
}

async function loadPinterestBoards() {
  console.log('Pinterest: loadPinterestBoards called');
  console.log('Pinterest: state.pinterestToken exists:', !!state.pinterestToken);

  if (!state.pinterestToken) {
    // Check storage for saved token
    console.log('Pinterest: No token in state, checking storage...');
    const result = await chrome.storage.local.get(['pinterestToken']);
    if (result.pinterestToken) {
      state.pinterestToken = result.pinterestToken;
      console.log('Pinterest: Token loaded from storage');
    } else {
      console.log('Pinterest: No token in storage, aborting');
      return;
    }
  }

  // Show loading state in the boards list
  console.log('Pinterest: Showing loading state');
  updatePinterestUI(true);
  elements.boardsList.innerHTML = `
    <div class="loading-boards">
      <div class="loading-spinner"></div>
      <p>Loading your boards...</p>
    </div>
  `;

  try {
    const idToken = await getFirebaseIdToken();
    console.log('Pinterest: Firebase ID token retrieved:', !!idToken);
    if (!idToken) {
      showToast('Please sign in first');
      return;
    }

    console.log('Pinterest: Fetching boards from:', CONFIG.functions.getPinterestBoardsUrl);
    const response = await fetch(CONFIG.functions.getPinterestBoardsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        pinterestAccessToken: state.pinterestToken
      })
    });

    console.log('Pinterest: Response status:', response.status);
    const result = await response.json();
    console.log('Pinterest: Response success:', result.success);
    console.log('Pinterest: Boards count:', result.data?.boards?.length || 0);

    if (result.success) {
      state.pinterestBoards = result.data.boards;
      renderPinterestBoards(result.data.boards);
    } else {
      console.error('Pinterest: API error:', result.error);
      throw new Error(result.error || 'Failed to fetch boards');
    }
  } catch (error) {
    console.error('Pinterest boards error:', error);
    // Show error state in the boards list
    elements.boardsList.innerHTML = `
      <div class="empty-state error-state">
        <p>Failed to load boards</p>
        <span>${error.message || 'Unknown error'}</span>
        <button class="retry-btn" id="retryBoardsBtn">Try Again</button>
      </div>
    `;
    // Add event listener for retry button
    const retryBtn = document.getElementById('retryBoardsBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', loadPinterestBoards);
    }
    showToast(error.message || 'Failed to load boards');
  }
}

function updatePinterestUI(isConnected) {
  const heroEl = document.querySelector('.pinterest-hero');
  const connectBtn = elements.connectPinterestBtn;

  if (isConnected) {
    // Hide the connect UI
    if (heroEl) heroEl.style.display = 'none';
    if (connectBtn) connectBtn.style.display = 'none';
    elements.pinterestBoards.style.display = 'block';
  } else {
    // Show the connect UI
    if (heroEl) heroEl.style.display = 'block';
    if (connectBtn) connectBtn.style.display = 'flex';
    elements.pinterestBoards.style.display = 'none';
  }
}

async function disconnectPinterest() {
  // Clear Pinterest token from storage and state
  await chrome.storage.local.remove(['pinterestToken', 'pinterestRefreshToken', 'pinterestTokenExpiry']);
  state.pinterestToken = null;
  state.pinterestBoards = [];

  // Reset UI to show connect button
  updatePinterestUI(false);
  elements.boardsList.innerHTML = '';

  showToast('Pinterest disconnected');
  console.log('Pinterest: Disconnected successfully');
}

function renderPinterestBoards(boards) {
  // Show connected state
  updatePinterestUI(true);

  if (!boards || boards.length === 0) {
    elements.boardsList.innerHTML = `
      <div class="empty-state">
        <p>No boards found</p>
        <span>Create some boards on Pinterest first</span>
      </div>
    `;
    return;
  }

  elements.boardsList.innerHTML = boards.map(board => {
    const thumbnailUrl = board.media?.image_cover_url || '';
    return `
      <div class="board-item" data-id="${board.id}" data-name="${board.name}" data-pin-count="${board.pinCount || 0}">
        <div class="board-thumb" ${thumbnailUrl ? `style="background-image: url(${thumbnailUrl})"` : ''}></div>
        <div class="board-info">
          <div class="board-name">${board.name}</div>
          <div class="board-count">${board.pinCount || 0} pins</div>
        </div>
        <span class="board-arrow">→</span>
      </div>
    `;
  }).join('');

  elements.pinterestBoards.style.display = 'block';

  // Add click handlers
  elements.boardsList.querySelectorAll('.board-item').forEach(item => {
    item.addEventListener('click', () => {
      const boardId = item.dataset.id;
      const boardName = item.dataset.name;
      const pinCount = parseInt(item.dataset.pinCount) || 0;
      state.currentBoard = { id: boardId, name: boardName, pinCount };
      analyzePinterestBoard(boardId, boardName);
    });
  });
}

async function analyzePinterestBoard(boardId, boardName) {
  showToast('Fetching pins from board...');

  try {
    const idToken = await getFirebaseIdToken();
    if (!idToken) {
      showToast('Please sign in first');
      return;
    }

    // Fetch all pins from the board (with pagination)
    let allPins = [];
    let bookmark = null;

    do {
      const response = await fetch(CONFIG.functions.getPinterestBoardPinsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          pinterestAccessToken: state.pinterestToken,
          boardId: boardId,
          bookmark: bookmark
        })
      });

      const result = await response.json();

      if (result.success) {
        allPins = allPins.concat(result.data.pins);
        bookmark = result.data.bookmark;
      } else {
        throw new Error(result.error || 'Failed to fetch pins');
      }
    } while (bookmark && allPins.length < 100); // Limit to 100 pins for performance

    if (allPins.length === 0) {
      showToast('No pins found in this board');
      return;
    }

    // Filter pins with images
    const pinsWithImages = allPins.filter(pin => pin.media?.images?.['600x']?.url);

    if (pinsWithImages.length === 0) {
      showToast('No analyzable images found');
      return;
    }

    // Show board analysis view
    showView('boardAnalysisView');
    updateBoardAnalysisHeader(boardName);

    // Clear previous results and show progress indicator
    const resultsEl = document.getElementById('boardAnalysisResults');
    const progressEl = document.getElementById('analysisProgress');
    if (resultsEl) {
      resultsEl.innerHTML = '';
      resultsEl.style.display = 'none';
    }
    if (progressEl) {
      progressEl.style.display = 'block';
    }

    // Clear previous state
    state.boardAnalysisResults = null;
    state.boardAnalyzedImages = [];

    // Delegate analysis to background service worker (persists across popup close)
    chrome.runtime.sendMessage({
      action: 'startBoardAnalysis',
      boardId: boardId,
      boardName: boardName,
      boardPinCount: state.currentBoard?.pinCount || pinsWithImages.length,
      pins: pinsWithImages,
      pinterestToken: state.pinterestToken
    }, (response) => {
      if (response?.success) {
        console.log('Popup: Board analysis started in background');
        // Start polling for status updates
        startBoardAnalysisPolling();
      } else {
        console.error('Popup: Failed to start board analysis:', response?.error);
        showToast(response?.error || 'Failed to start analysis');
      }
    });

  } catch (error) {
    console.error('Pinterest board analysis error:', error);
    showToast(error.message || 'Failed to analyze board');
  }
}

function updateBoardAnalysisHeader(boardName) {
  const headerEl = document.getElementById('boardAnalysisHeader');
  if (headerEl) {
    headerEl.innerHTML = `
      <h2 class="board-analysis-title">${boardName}</h2>
    `;
  }
}

function updateAnalysisProgress(current, total) {
  state.boardAnalysisProgress = { current, total };
  const progressEl = document.getElementById('analysisProgress');
  if (progressEl) {
    const percentage = Math.round((current / total) * 100);
    progressEl.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
      <p class="progress-text">Analyzing board...</p>
    `;
  }
}

async function analyzePinsInBatch(pins) {
  const analyses = [];

  // Cost-effective sampling: analyze max 8 pins for aggregate insights
  // This provides statistically meaningful results while minimizing API costs
  const MAX_PINS_TO_ANALYZE = 8;
  const BATCH_SIZE = 3; // Process 3 pins in parallel

  // Random sampling for diverse board representation
  let sampledPins;
  if (pins.length <= MAX_PINS_TO_ANALYZE) {
    sampledPins = pins;
  } else {
    // Fisher-Yates shuffle and take first N
    const shuffled = [...pins];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    sampledPins = shuffled.slice(0, MAX_PINS_TO_ANALYZE);
  }

  const total = sampledPins.length;
  let completed = 0;

  // Process pins in parallel batches
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = sampledPins.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchPromises = batch.map(async (pin) => {
      try {
        const imageUrl = pin.media?.images?.['600x']?.url || pin.media?.images?.['400x300']?.url;
        if (!imageUrl) return null;

        const analysis = await analyzeAesthetic(imageUrl);
        if (analysis) {
          return {
            pinId: pin.id,
            imageUrl: imageUrl,
            analysis: analysis
          };
        }
      } catch (error) {
        console.error(`Failed to analyze pin ${pin.id}:`, error);
      }
      return null;
    });

    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);

    // Add successful results
    batchResults.forEach(result => {
      if (result) {
        analyses.push(result);
        completed++;
        updateAnalysisProgress(completed, total);
      }
    });

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < total) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Aggregate results
  const aggregateResults = aggregateAnalyses(analyses);
  state.boardAnalysisResults = aggregateResults;

  // Display aggregate results
  displayBoardAnalysisResults(aggregateResults, analyses);
}

function aggregateAnalyses(analyses) {
  if (!analyses || analyses.length === 0) {
    return null;
  }

  // Count aesthetic names and collect summaries
  const aestheticCounts = {};
  const aestheticSummaries = {}; // Store summaries by aesthetic name
  const allGarments = [];
  const allRunwayRefs = [];

  analyses.forEach(item => {
    const analysis = item.analysis;

    // Count aesthetics and store their summaries
    if (analysis.aestheticName) {
      aestheticCounts[analysis.aestheticName] = (aestheticCounts[analysis.aestheticName] || 0) + 1;
      // Store the summary for this aesthetic (keep the first one we find)
      if (analysis.summary && !aestheticSummaries[analysis.aestheticName]) {
        aestheticSummaries[analysis.aestheticName] = analysis.summary;
      }
    }

    // Collect elements
    if (analysis.coreGarments) allGarments.push(...analysis.coreGarments);
    if (analysis.runwayReferences) allRunwayRefs.push(...analysis.runwayReferences);
  });

  // Get top aesthetics
  const topAesthetics = Object.entries(aestheticCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / analyses.length) * 100) }));

  // Get most common garments
  const garmentCounts = countOccurrences(allGarments);
  const topGarments = Object.entries(garmentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([garment]) => garment);

  // Get most referenced designers with their collections
  const designerData = {};
  allRunwayRefs.forEach(ref => {
    if (ref.designer) {
      if (!designerData[ref.designer]) {
        designerData[ref.designer] = { count: 0, collections: [] };
      }
      designerData[ref.designer].count++;
      if (ref.collection && !designerData[ref.designer].collections.includes(ref.collection)) {
        designerData[ref.designer].collections.push(ref.collection);
      }
    }
  });
  const topDesigners = Object.entries(designerData)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([designer, data]) => ({
      designer,
      count: data.count,
      collections: data.collections.slice(0, 3) // Max 3 collections
    }));

  const dominantAesthetic = topAesthetics[0]?.name || 'Mixed Aesthetics';
  const aestheticSummary = aestheticSummaries[dominantAesthetic] || '';

  return {
    totalAnalyzed: analyses.length,
    topAesthetics,
    topGarments,
    topDesigners,
    dominantAesthetic,
    summary: aestheticSummary
  };
}

// Format collection names to abbreviated format (e.g., "Fall/Winter 2023" -> "FW23")
function formatCollection(collection) {
  if (!collection) return '';

  let formatted = collection;

  // Extract year (last 2 digits)
  const yearMatch = collection.match(/\b(19|20)?(\d{2})\b/);
  const year = yearMatch ? yearMatch[2] : '';

  // Replace season names with abbreviations
  formatted = formatted
    .replace(/Fall\s*\/?\s*Winter/gi, 'FW')
    .replace(/Autumn\s*\/?\s*Winter/gi, 'AW')
    .replace(/Spring\s*\/?\s*Summer/gi, 'SS')
    .replace(/Resort/gi, 'RS')
    .replace(/Pre-?Fall/gi, 'PF')
    .replace(/Cruise/gi, 'CR')
    .replace(/Fall/gi, 'F')
    .replace(/Winter/gi, 'W')
    .replace(/Spring/gi, 'S')
    .replace(/Summer/gi, 'S')
    .replace(/Autumn/gi, 'A')
    .replace(/F\/W/gi, 'FW')
    .replace(/S\/S/gi, 'SS')
    .replace(/A\/W/gi, 'AW');

  // Clean up: extract just the season code and year
  const seasonMatch = formatted.match(/\b(FW|AW|SS|RS|PF|CR|F|W|S|A)\b/i);
  const season = seasonMatch ? seasonMatch[1].toUpperCase() : '';

  if (season && year) {
    return `${season}${year}`;
  } else if (season) {
    return season;
  } else if (year) {
    return `'${year}`;
  }

  // If no pattern matched, return shortened original (remove "Men's", "Women's", etc.)
  return collection.replace(/\s*(Men'?s?|Women'?s?|Various|Menswear|Womenswear)\s*/gi, '').trim().substring(0, 10);
}

function countOccurrences(arr) {
  const counts = {};
  arr.forEach(item => {
    const normalized = item.toLowerCase().trim();
    counts[normalized] = (counts[normalized] || 0) + 1;
  });
  return counts;
}

function displayBoardAnalysisResults(aggregate, analyses) {
  const resultsEl = document.getElementById('boardAnalysisResults');
  if (!resultsEl || !aggregate) return;

  // Extract image URLs for the collage (limit to 8 images max)
  // Only update if not already set (polling sets it before calling this function)
  const extractedUrls = analyses
    .filter(a => a && a.imageUrl)
    .map(a => a.imageUrl)
    .slice(0, 8);

  // Use extracted URLs if we have them, otherwise keep existing state
  const imageUrls = extractedUrls.length > 0 ? extractedUrls : (state.boardAnalyzedImages || []);

  // Store analyzed images in state for shareable card
  state.boardAnalyzedImages = imageUrls;

  // Generate collage HTML
  const collageCount = imageUrls.length;
  const collageHtml = collageCount > 0 ? `
    <div class="board-image-collage" data-count="${collageCount}">
      ${imageUrls.map((url, i) => `<img src="${url}" alt="Pin ${i + 1}" crossorigin="anonymous">`).join('')}
    </div>
  ` : '';

  resultsEl.innerHTML = `
    <div class="aggregate-header">
      ${collageHtml}
      <span class="aggregate-label">Board aesthetic profile</span>
      <h2 class="aggregate-title">${aggregate.dominantAesthetic}</h2>
      ${aggregate.summary ? `<div class="aesthetic-summary"><p>${aggregate.summary}</p></div>` : ''}
    </div>

    <div class="analysis-card">
      <div class="card-header expanded">
        <span>Core Garments to Shop</span>
      </div>
      <div class="card-content expanded">
        <ul class="garments-list aggregate-list">
          ${aggregate.topGarments.map(g => `<li class="garment-item"><span class="garment-icon">•</span>${g}</li>`).join('')}
        </ul>
      </div>
    </div>

    <div class="analysis-card">
      <div class="card-header expanded">
        <span>Top Designer References</span>
      </div>
      <div class="card-content expanded">
        <div class="designer-list">
          ${aggregate.topDesigners.map(d => {
    const collectionsText = d.collections && d.collections.length > 0
      ? [...new Set(d.collections.map(c => formatCollection(c)))].slice(0, 3).join(', ')
      : `${d.count} ${d.count === 1 ? 'reference' : 'references'}`;
    return `
              <div class="designer-item">
                <span class="designer-name">${d.designer}</span>
                <span class="designer-count">${collectionsText}</span>
              </div>
            `;
  }).join('')}
        </div>
      </div>
    </div>

    <div class="action-footer">
      <button class="primary-btn" id="createBoardCardBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 12h6M12 9v6" />
        </svg>
        Create card
      </button>
      <button class="secondary-btn" id="saveBoardAnalysisBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
        Save
      </button>
    </div>
  `;

  // Hide progress, show results
  const progressEl = document.getElementById('analysisProgress');
  if (progressEl) progressEl.style.display = 'none';
  resultsEl.style.display = 'block';

  // Add click handler for save button
  const saveBoardBtn = document.getElementById('saveBoardAnalysisBtn');
  if (saveBoardBtn) {
    saveBoardBtn.addEventListener('click', saveBoardAnalysis);
  }

  // Add click handler for create card button
  const createCardBtn = document.getElementById('createBoardCardBtn');
  if (createCardBtn) {
    createCardBtn.addEventListener('click', createBoardShareableCard);
  }

  // Update save button state based on whether this board is already saved
  updateBoardSaveButtonState();

  // Auto-save to recent
  autoSaveBoardAnalysis();
}

// ============================================
// Board Analysis Polling & Restoration
// ============================================

let boardAnalysisPollingInterval = null;

function startBoardAnalysisPolling() {
  // Clear any existing polling
  if (boardAnalysisPollingInterval) {
    clearInterval(boardAnalysisPollingInterval);
  }

  // Poll every 500ms for status updates
  boardAnalysisPollingInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'getBoardAnalysisStatus' }, (response) => {
      if (response?.success && response.data) {
        const status = response.data;

        if (status.status === 'analyzing') {
          // Update progress UI
          updateAnalysisProgress(status.analyzedCount, status.totalPins);
        } else if (status.status === 'complete') {
          // Stop polling
          clearInterval(boardAnalysisPollingInterval);
          boardAnalysisPollingInterval = null;

          // Update state and display results
          state.boardAnalysisResults = status.aggregateResults;
          state.boardAnalyzedImages = status.imageUrls;
          state.currentBoard = {
            id: status.boardId,
            name: status.boardName,
            pinCount: status.boardPinCount || status.totalPins
          };

          displayBoardAnalysisResults(status.aggregateResults, status.results);

          // Clear the stored analysis state (it's now in UI)
          chrome.storage.local.remove('boardAnalysisState');
        } else if (status.status === 'error') {
          // Stop polling
          clearInterval(boardAnalysisPollingInterval);
          boardAnalysisPollingInterval = null;

          showToast(status.error || 'Analysis failed');
          showView('pinterestView');
        }
      }
    });
  }, 500);
}

async function checkForOngoingBoardAnalysis() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getBoardAnalysisStatus' }, (response) => {
      if (response?.success && response.data && response.data.status !== 'idle') {
        resolve(response.data);
      } else {
        resolve(null);
      }
    });
  });
}

function restoreBoardAnalysisUI(analysisState) {
  // Show the board analysis view
  showView('boardAnalysisView');
  updateBoardAnalysisHeader(analysisState.boardName);

  // Set currentBoard from the analysis state
  state.currentBoard = {
    id: analysisState.boardId,
    name: analysisState.boardName,
    pinCount: analysisState.boardPinCount || analysisState.totalPins
  };

  // Clear and setup results/progress elements
  const resultsEl = document.getElementById('boardAnalysisResults');
  const progressEl = document.getElementById('analysisProgress');

  if (analysisState.status === 'complete') {
    // Analysis finished while popup was closed - display results
    state.boardAnalysisResults = analysisState.aggregateResults;
    state.boardAnalyzedImages = analysisState.imageUrls;

    displayBoardAnalysisResults(analysisState.aggregateResults, analysisState.results);

    // Clear the stored state
    chrome.storage.local.remove('boardAnalysisState');
  } else if (analysisState.status === 'analyzing') {
    // Analysis still in progress - show progress and start polling
    if (resultsEl) {
      resultsEl.innerHTML = '';
      resultsEl.style.display = 'none';
    }
    if (progressEl) {
      progressEl.style.display = 'block';
      updateAnalysisProgress(analysisState.analyzedCount, analysisState.totalPins);
    }

    startBoardAnalysisPolling();
  }
}

// ============================================
// Image Analysis Polling & Restoration
// ============================================

let imageAnalysisPollingInterval = null;

function startImageAnalysisPolling() {
  // Clear any existing polling
  if (imageAnalysisPollingInterval) {
    clearInterval(imageAnalysisPollingInterval);
  }

  // Poll every 500ms for status updates
  imageAnalysisPollingInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'getImageAnalysisStatus' }, (response) => {
      if (response?.success && response.data) {
        const status = response.data;

        if (status.status === 'analyzing') {
          // Still analyzing - UI already shows loading state
          console.log('Prometheus popup: Image analysis in progress...');
        } else if (status.status === 'complete') {
          // Stop polling
          clearInterval(imageAnalysisPollingInterval);
          imageAnalysisPollingInterval = null;

          // Update state and display results
          state.currentImage = status.imageUrl;
          state.currentAnalysis = status.result;

          // Hide loading state and show results
          elements.loadingState.classList.remove('active');

          // Get runway references and display
          getRunwayReferences(status.result.aestheticName, status.result.runwayReferences).then(refs => {
            displayAnalysisResults(status.result, refs);
          });

          // Auto-save
          autoSaveAnalysis();

          // Clear the stored analysis state
          chrome.storage.local.remove('imageAnalysisState');
        } else if (status.status === 'error') {
          // Stop polling
          clearInterval(imageAnalysisPollingInterval);
          imageAnalysisPollingInterval = null;

          showToast(status.error || 'Analysis failed');
          showView('homeView');

          // Clear the stored state
          chrome.storage.local.remove('imageAnalysisState');
        }
      }
    });
  }, 500);
}

async function checkForOngoingImageAnalysis() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getImageAnalysisStatus' }, (response) => {
      if (response?.success && response.data && response.data.status !== 'idle') {
        resolve(response.data);
      } else {
        resolve(null);
      }
    });
  });
}

function restoreImageAnalysisUI(analysisState) {
  // Show the analysis view
  showView('analysisView');

  // Set image preview
  elements.analyzedImage.src = analysisState.imageUrl;

  if (analysisState.status === 'complete') {
    // Analysis finished while popup was closed - display results
    state.currentImage = analysisState.imageUrl;
    state.currentAnalysis = analysisState.result;

    // Hide loading, get references and display
    elements.loadingState.classList.remove('active');
    getRunwayReferences(analysisState.result.aestheticName, analysisState.result.runwayReferences).then(refs => {
      displayAnalysisResults(analysisState.result, refs);
    });

    // Auto-save if not already saved
    autoSaveAnalysis();

    // Clear the stored state
    chrome.storage.local.remove('imageAnalysisState');
  } else if (analysisState.status === 'analyzing') {
    // Analysis still in progress - show loading and start polling
    elements.loadingState.classList.add('active');
    elements.analysisResults.classList.remove('active');

    startImageAnalysisPolling();
  } else if (analysisState.status === 'error') {
    // Show error and go home
    showToast(analysisState.error || 'Analysis failed');
    showView('homeView');
    chrome.storage.local.remove('imageAnalysisState');
  }
}

// ============================================
// Content Script Communication
// ============================================

async function initCaptureMode() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      showToast('Cannot capture on this page');
      return;
    }

    // Check if it's a page we can inject into
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showToast('Cannot capture on this page');
      return;
    }

    // First, try to inject the content script (in case it's not already there)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Also inject the CSS
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content-styles.css']
      });
    } catch (injectError) {
      // Script might already be injected, that's ok
      console.log('Script injection note:', injectError.message);
    }

    // Now send the start capture message
    chrome.tabs.sendMessage(tab.id, { action: 'startCapture' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Capture error:', chrome.runtime.lastError.message);
        showToast('Cannot capture on this page');
        return;
      }

      // Close the popup - the background script will open a popup window when image is captured
      // Note: Chrome popups ALWAYS close when you click outside them - this is browser behavior
      window.close();
    });
  } catch (error) {
    console.error('Capture mode error:', error);
    showToast('Cannot capture on this page');
  }
}

// Listen for captured images from content script or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Prometheus popup: Received message:', message.action);
  if ((message.action === 'imageCaptured' || message.action === 'capturedImage') && message.imageUrl) {
    console.log('Prometheus popup: Processing captured image URL');

    // Clear capture tab state since we got the image
    state.captureTabId = null;

    // Update the loading text to show we're now analyzing
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = 'Analyzing aesthetic...';
    }

    // Process the image
    handleImageUrl(message.imageUrl);

    // Send success response to content script
    sendResponse({ success: true });
    return true; // Keep channel open for async
  }
});

// ============================================
// Storage Functions
// ============================================

// Auto-save analysis without user prompts (called after each analysis)
// Saves to recentAnalyses (separate from user-saved savedAnalyses)
async function autoSaveAnalysis() {
  if (!state.currentAnalysis || !state.currentImage) {
    return;
  }

  // Check if this image is already in recent (by image URL only, not aesthetic name)
  const existingResult = await chrome.storage.local.get(['recentAnalyses']);
  const existingAnalyses = existingResult.recentAnalyses || [];
  const alreadySaved = existingAnalyses.some(item => item.image === state.currentImage);

  if (alreadySaved) {
    // Image already in recent, skip silently to prevent duplicates
    return;
  }

  const recentItem = {
    id: Date.now(),
    image: state.currentImage,
    analysis: state.currentAnalysis,
    timestamp: new Date().toISOString()
  };

  // Add new item to the beginning
  existingAnalyses.unshift(recentItem);

  // Keep only last 20 recent analyses
  const trimmedAnalyses = existingAnalyses.slice(0, 20);

  // Save back to storage
  await chrome.storage.local.set({ recentAnalyses: trimmedAnalyses });

  state.recentAnalyses = trimmedAnalyses;

  // Update the recent list UI only
  updateRecentList();
}

// Auto-save board analysis to recent (called after board analysis completes)
async function autoSaveBoardAnalysis() {
  console.log('autoSaveBoardAnalysis: Called', {
    hasResults: !!state.boardAnalysisResults,
    hasBoard: !!state.currentBoard,
    boardId: state.currentBoard?.id,
    imageCount: state.boardAnalyzedImages?.length
  });

  try {
    if (!state.boardAnalysisResults || !state.currentBoard) {
      console.log('autoSaveBoardAnalysis: Missing state, skipping');
      return;
    }

    // Check if this board is already in recent (by board ID)
    const existingResult = await chrome.storage.local.get(['recentBoardAnalyses']);
    const existingAnalyses = existingResult.recentBoardAnalyses || [];
    const currentBoardId = String(state.currentBoard.id);
    const alreadySaved = existingAnalyses.some(item => String(item.boardId) === currentBoardId);

    if (alreadySaved) {
      // Board already in recent, update it instead of skipping
      console.log('autoSaveBoardAnalysis: Updating existing board in recent');
      const updatedAnalyses = existingAnalyses.map(item => {
        if (String(item.boardId) === currentBoardId) {
          return {
            ...item,
            analysis: state.boardAnalysisResults,
            imageUrls: state.boardAnalyzedImages || [],
            timestamp: new Date().toISOString()
          };
        }
        return item;
      });
      await chrome.storage.local.set({ recentBoardAnalyses: updatedAnalyses });
      state.recentBoardAnalyses = updatedAnalyses;
      updateRecentList();
      return;
    }

    const recentBoardItem = {
      id: Date.now(),
      boardId: state.currentBoard.id,
      boardName: state.currentBoard.name,
      pinCount: state.currentBoard.pinCount || 0,
      analysis: state.boardAnalysisResults,
      imageUrls: state.boardAnalyzedImages || [],
      timestamp: new Date().toISOString(),
      type: 'board'
    };

    // Add new item to the beginning
    existingAnalyses.unshift(recentBoardItem);

    // Keep only last 10 recent board analyses
    const trimmedAnalyses = existingAnalyses.slice(0, 10);

    // Save back to storage
    await chrome.storage.local.set({ recentBoardAnalyses: trimmedAnalyses });
    console.log('autoSaveBoardAnalysis: Saved board to recent');

    state.recentBoardAnalyses = trimmedAnalyses;

    // Update the recent list UI
    updateRecentList();
  } catch (error) {
    console.error('autoSaveBoardAnalysis error:', error);
  }
}

// Update save button state for individual image analysis
function updateImageSaveButtonState() {
  if (!elements.saveBtn || !state.currentImage) return;

  const isSaved = state.savedAnalyses.some(item => item.image === state.currentImage);

  if (isSaved) {
    elements.saveBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      Saved
    `;
  } else {
    elements.saveBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      Save
    `;
  }
}

// Update save button state for board analysis
function updateBoardSaveButtonState() {
  const saveBoardBtn = document.getElementById('saveBoardAnalysisBtn');
  if (!saveBoardBtn || !state.currentBoard) return;

  const isSaved = state.savedBoardAnalyses.some(item => item.boardId === state.currentBoard.id);

  if (isSaved) {
    saveBoardBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      Saved
    `;
  } else {
    saveBoardBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      Save
    `;
  }
}

async function saveAnalysis() {
  if (!state.currentAnalysis) {
    showToast('No analysis to save');
    return;
  }

  // Check if already saved (by image URL only to prevent duplicates)
  const existingResult = await chrome.storage.local.get(['savedAnalyses']);
  const existingAnalyses = existingResult.savedAnalyses || [];
  const alreadySaved = existingAnalyses.some(item => item.image === state.currentImage);

  if (alreadySaved) {
    showToast('Already saved');
    return;
  }

  const savedItem = {
    id: Date.now(),
    image: state.currentImage,
    analysis: state.currentAnalysis,
    timestamp: new Date().toISOString()
  };

  // Load existing saved items
  const result = await chrome.storage.local.get(['savedAnalyses']);
  const savedAnalyses = result.savedAnalyses || [];

  // Add new item
  savedAnalyses.unshift(savedItem);

  // Save back to storage
  await chrome.storage.local.set({ savedAnalyses });

  state.savedAnalyses = savedAnalyses;
  showToast('Aesthetic saved');

  // Update save button to filled icon
  if (elements.saveBtn) {
    elements.saveBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      Saved
    `;
  }

  updateRecentList();
  updateSavedList();
}

async function saveBoardAnalysis() {
  if (!state.boardAnalysisResults || !state.currentBoard) {
    showToast('No board analysis to save');
    return;
  }

  // Load existing saved items
  const existingResult = await chrome.storage.local.get(['savedBoardAnalyses']);
  let existingAnalyses = existingResult.savedBoardAnalyses || [];

  // Check if already saved (by board ID) - remove old one if exists to allow update
  const existingIndex = existingAnalyses.findIndex(item => item.boardId === state.currentBoard.id);
  if (existingIndex !== -1) {
    existingAnalyses.splice(existingIndex, 1);
  }

  const savedBoardItem = {
    id: Date.now(),
    boardId: state.currentBoard.id,
    boardName: state.currentBoard.name,
    pinCount: state.currentBoard.pinCount || 0,
    analysis: state.boardAnalysisResults,
    imageUrls: state.boardAnalyzedImages || [],  // Save collage images
    timestamp: new Date().toISOString(),
    type: 'board' // To distinguish from regular analyses
  };

  // Add new item at the beginning
  existingAnalyses.unshift(savedBoardItem);

  // Save back to storage
  await chrome.storage.local.set({ savedBoardAnalyses: existingAnalyses });

  state.savedBoardAnalyses = existingAnalyses;
  showToast(existingIndex !== -1 ? 'Board analysis updated' : 'Board analysis saved');

  // Update save button to filled icon
  const saveBoardBtn = document.getElementById('saveBoardAnalysisBtn');
  if (saveBoardBtn) {
    saveBoardBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
      Saved
    `;
  }

  updateSavedList();
}

async function loadSavedAnalyses() {
  const result = await chrome.storage.local.get(['savedAnalyses', 'recentAnalyses', 'savedBoardAnalyses', 'recentBoardAnalyses']);
  state.savedAnalyses = result.savedAnalyses || [];
  state.recentAnalyses = result.recentAnalyses || [];
  state.savedBoardAnalyses = result.savedBoardAnalyses || [];
  state.recentBoardAnalyses = result.recentBoardAnalyses || [];
  updateRecentList();
  updateSavedList();
}

function updateRecentList() {
  if (!elements.recentList) return;

  // Combine pin and board analyses, sorted by timestamp
  const allRecent = [
    ...state.recentAnalyses.map(item => ({ ...item, type: 'image' })),
    ...state.recentBoardAnalyses.map(item => ({ ...item, type: 'board' }))
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (allRecent.length === 0) {
    elements.recentList.innerHTML = `
      <div class="empty-state">
        <p>No analyses yet</p>
        <span>Your style discoveries will appear here</span>
      </div>
    `;
    return;
  }

  const recentItems = allRecent.slice(0, 5);
  elements.recentList.innerHTML = recentItems.map(item => {
    if (item.type === 'board') {
      const thumbUrl = item.imageUrls?.[0] || '';
      const thumbHtml = thumbUrl
        ? `<img class="recent-thumb" src="${thumbUrl}" alt="${item.boardName}">`
        : `<div class="recent-thumb recent-thumb--icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg></div>`;
      return `
        <div class="recent-item" data-id="${item.id}" data-type="board">
          ${thumbHtml}
          <div class="recent-info">
            <div class="recent-title">${item.analysis.dominantAesthetic}</div>
            <div class="recent-date">${item.boardName}</div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="recent-item" data-id="${item.id}" data-type="image">
          <img class="recent-thumb" src="${item.image}" alt="${item.analysis.aestheticName}">
          <div class="recent-info">
            <div class="recent-title">${item.analysis.aestheticName}</div>
            <div class="recent-date">${formatDate(item.timestamp)}</div>
          </div>
        </div>
      `;
    }
  }).join('');

  // Add click handlers
  elements.recentList.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.dataset.id);
      const type = item.dataset.type;

      if (type === 'board') {
        const recentItem = state.recentBoardAnalyses.find(a => a.id === id);
        if (recentItem) {
          state.currentBoard = {
            id: recentItem.boardId,
            name: recentItem.boardName,
            pinCount: recentItem.pinCount
          };
          state.boardAnalysisResults = recentItem.analysis;
          state.boardAnalyzedImages = recentItem.imageUrls || [];
          showView('boardAnalysisView');
          // Update header
          const headerEl = document.getElementById('boardAnalysisHeader');
          if (headerEl) {
            headerEl.innerHTML = `
              <h2 class="board-analysis-title">${recentItem.boardName}</h2>
            `;
          }
          // Hide progress, show results directly
          const progressEl = document.getElementById('analysisProgress');
          if (progressEl) progressEl.style.display = 'none';
          // Pass saved image URLs as pseudo-analyses for collage display
          const pseudoAnalyses = (recentItem.imageUrls || []).map(url => ({ imageUrl: url }));
          displayBoardAnalysisResults(recentItem.analysis, pseudoAnalyses);
        }
      } else {
        const recentItem = state.recentAnalyses.find(a => a.id === id);
        if (recentItem) {
          state.currentImage = recentItem.image;
          state.currentAnalysis = recentItem.analysis;
          showView('analysisView');
          elements.analyzedImage.src = recentItem.image;
          elements.loadingState.classList.remove('active');
          getRunwayReferences(recentItem.analysis.aestheticName, recentItem.analysis.runwayReferences).then(refs => {
            displayAnalysisResults(recentItem.analysis, refs);
          });
        }
      }
    });
  });
}

function updateSavedList() {
  if (!elements.savedList) return;

  // Combine regular and board analyses, sorted by timestamp
  const allSaved = [
    ...state.savedAnalyses.map(item => ({ ...item, type: 'image' })),
    ...state.savedBoardAnalyses.map(item => ({ ...item, type: 'board' }))
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (allSaved.length === 0) {
    elements.savedList.innerHTML = `
      <div class="empty-saved">
        <div class="empty-illustration">
          <div class="mock-card">
            <span class="prometheus-mark small">P</span>
            <div class="mock-text"></div>
          </div>
        </div>
        <p class="empty-title">No items saved yet</p>
        <p class="empty-desc">Save your analyses and compare them in Prometheus. Easily revisit your discoveries anytime.</p>
      </div>
    `;
    return;
  }

  elements.savedList.innerHTML = allSaved.map(item => {
    if (item.type === 'board') {
      // Board analysis item - use first analyzed image as cover
      const coverUrl = item.imageUrls?.[0] || '';
      return `
        <div class="saved-item saved-item--board" data-id="${item.id}" data-type="board">
          <img class="saved-thumb" src="${coverUrl}" alt="${item.boardName}">
          <div class="saved-info">
            <div class="saved-title">${item.boardName}</div>
            <div class="saved-summary">${item.analysis.dominantAesthetic} • ${item.pinCount || item.analysis.totalAnalyzed} pins</div>
            <div class="saved-date">${formatDate(item.timestamp)}</div>
          </div>
          <button class="delete-saved-btn" data-id="${item.id}" data-type="board" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `;
    } else {
      // Regular image analysis item
      return `
        <div class="saved-item" data-id="${item.id}" data-type="image">
          <img class="saved-thumb" src="${item.image}" alt="${item.analysis.aestheticName}">
          <div class="saved-info">
            <div class="saved-title">${item.analysis.aestheticName}</div>
            <div class="saved-summary">${item.analysis.summary?.substring(0, 60) || ''}${item.analysis.summary?.length > 60 ? '...' : ''}</div>
            <div class="saved-date">${formatDate(item.timestamp)}</div>
          </div>
          <button class="delete-saved-btn" data-id="${item.id}" data-type="image" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `;
    }
  }).join('');

  // Add click handlers for saved items
  elements.savedList.querySelectorAll('.saved-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Ignore if clicking delete button
      if (e.target.closest('.delete-saved-btn')) return;

      const id = parseInt(item.dataset.id);
      const type = item.dataset.type;

      if (type === 'board') {
        // Open board analysis view
        const savedItem = state.savedBoardAnalyses.find(a => a.id === id);
        if (savedItem) {
          state.currentBoard = {
            id: savedItem.boardId,
            name: savedItem.boardName,
            pinCount: savedItem.pinCount
          };
          state.boardAnalysisResults = savedItem.analysis;
          state.boardAnalyzedImages = savedItem.imageUrls || [];  // Restore collage images
          showView('boardAnalysisView');
          // Update header
          const headerEl = document.getElementById('boardAnalysisHeader');
          if (headerEl) {
            headerEl.innerHTML = `
              <h2 class="board-analysis-title">${savedItem.boardName}</h2>
            `;
          }
          // Hide progress, show results directly
          const progressEl = document.getElementById('analysisProgress');
          if (progressEl) progressEl.style.display = 'none';
          // Pass saved image URLs as pseudo-analyses for collage display
          const pseudoAnalyses = (savedItem.imageUrls || []).map(url => ({ imageUrl: url }));
          displayBoardAnalysisResults(savedItem.analysis, pseudoAnalyses);
        }
      } else {
        // Open regular analysis view
        const savedItem = state.savedAnalyses.find(a => a.id === id);
        if (savedItem) {
          state.currentImage = savedItem.image;
          state.currentAnalysis = savedItem.analysis;
          showView('analysisView');
          elements.analyzedImage.src = savedItem.image;
          elements.loadingState.classList.remove('active');
          getRunwayReferences(savedItem.analysis.aestheticName, savedItem.analysis.runwayReferences).then(refs => {
            displayAnalysisResults(savedItem.analysis, refs);
          });
        }
      }
    });
  });

  // Add click handlers for delete buttons
  elements.savedList.querySelectorAll('.delete-saved-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const type = btn.dataset.type;
      if (type === 'board') {
        await deleteSavedBoardAnalysis(id);
      } else {
        await deleteSavedAnalysis(id);
      }
    });
  });
}

async function deleteSavedAnalysis(id) {
  const result = await chrome.storage.local.get(['savedAnalyses']);
  const savedAnalyses = (result.savedAnalyses || []).filter(item => item.id !== id);

  await chrome.storage.local.set({ savedAnalyses });
  state.savedAnalyses = savedAnalyses;

  updateRecentList();
  updateSavedList();
  updateImageSaveButtonState();
  showToast('Aesthetic removed');
}

async function deleteSavedBoardAnalysis(id) {
  const result = await chrome.storage.local.get(['savedBoardAnalyses']);
  const savedBoardAnalyses = (result.savedBoardAnalyses || []).filter(item => item.id !== id);

  await chrome.storage.local.set({ savedBoardAnalyses });
  state.savedBoardAnalyses = savedBoardAnalyses;

  updateSavedList();
  updateBoardSaveButtonState();
  showToast('Board analysis removed');
}

// ============================================
// Utility Functions
// ============================================

function showToast(message) {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create new toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('active');
  });

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Event Listeners
// ============================================

function initEventListeners() {
  // Navigation
  elements.navHome.addEventListener('click', () => showView('homeView'));
  elements.navCollections.addEventListener('click', () => showView('collectionsView'));
  elements.viewAllBtn.addEventListener('click', () => showView('collectionsView'));

  // Action buttons
  elements.captureBtn.addEventListener('click', initCaptureMode);

  elements.uploadBtn.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = ''; // Reset for next upload
  });

  elements.pinterestBtn.addEventListener('click', async () => {
    showView('pinterestView');
    // If already connected, load boards
    if (state.pinterestToken) {
      await loadPinterestBoards();
    }
  });

  // Back buttons
  elements.backBtn.addEventListener('click', () => {
    // If we were in capture mode, tell the content script to stop
    if (state.captureTabId) {
      chrome.tabs.sendMessage(state.captureTabId, { action: 'stopCapture' }).catch(() => { });
      state.captureTabId = null;
    }
    showView('homeView');
  });
  elements.cardBackBtn.addEventListener('click', () => showView('analysisView'));
  elements.pinterestBackBtn.addEventListener('click', () => showView('homeView'));
  if (elements.boardAnalysisBackBtn) {
    elements.boardAnalysisBackBtn.addEventListener('click', () => showView('pinterestView'));
  }
  if (elements.boardCardBackBtn) {
    elements.boardCardBackBtn.addEventListener('click', () => showView('boardAnalysisView'));
  }
  if (elements.downloadBoardCardBtn) {
    elements.downloadBoardCardBtn.addEventListener('click', downloadBoardCard);
  }
  if (elements.copyBoardCardBtn) {
    elements.copyBoardCardBtn.addEventListener('click', copyBoardCard);
  }

  // Analysis actions
  elements.createCardBtn.addEventListener('click', createShareableCard);
  elements.saveBtn.addEventListener('click', saveAnalysis);

  // Pinterest
  elements.connectPinterestBtn.addEventListener('click', connectPinterest);
  if (elements.disconnectPinterestBtn) {
    elements.disconnectPinterestBtn.addEventListener('click', disconnectPinterest);
  }

  // Card actions
  elements.downloadCardBtn.addEventListener('click', downloadCard);
  elements.copyLinkBtn.addEventListener('click', copyCardLink);

  // Account button - show sign out option if signed in, or sign-in overlay if not
  elements.accountBtn.addEventListener('click', () => {
    if (state.isAuthenticated) {
      // Show a simple confirm for sign out
      if (confirm(`Signed in as ${state.user?.email}\n\nSign out?`)) {
        handleSignOut();
      }
    } else {
      // Show the sign-in overlay
      elements.signInOverlay.style.display = 'flex';
    }
  });

  // Google Sign In button
  elements.googleSignInBtn.addEventListener('click', handleSignIn);

  // Close sign-in overlay when clicking outside the content
  elements.signInOverlay.addEventListener('click', (e) => {
    if (e.target === elements.signInOverlay) {
      elements.signInOverlay.style.display = 'none';
    }
  });
}

// ============================================
// Authentication
// ============================================

async function checkAuthStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getAuthStatus' }, (response) => {
      if (response?.success && response.data) {
        state.user = response.data.user;
        state.isAuthenticated = response.data.authenticated;
      }
      resolve(state.isAuthenticated);
    });
  });
}

async function handleSignIn() {
  const btn = elements.googleSignInBtn;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>Signing in...</span>`;

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'signIn' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Sign in failed'));
        }
      });
    });

    state.user = response.user;
    state.isAuthenticated = true;
    updateAuthUI();
    showToast(`Welcome, ${state.user.displayName || state.user.email}!`);
  } catch (error) {
    console.error('Sign in error:', error);
    showToast(error.message || 'Sign in failed. Please try again.');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function handleSignOut() {
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'signOut' }, (response) => {
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Sign out failed'));
        }
      });
    });

    state.user = null;
    state.isAuthenticated = false;
    updateAuthUI();
    showToast('Signed out');
  } catch (error) {
    console.error('Sign out error:', error);
    showToast('Sign out failed');
  }
}

function updateAuthUI() {
  // Sign-in is optional - hide overlay always, just update account button
  elements.signInOverlay.style.display = 'none';

  if (state.isAuthenticated && state.user) {
    // Update account button to show user avatar
    if (state.user.photoURL) {
      elements.accountBtn.innerHTML = `<img class="user-avatar" src="${state.user.photoURL}" alt="${state.user.displayName || 'User'}">`;
      elements.accountBtn.classList.add('signed-in');
    }
  } else {
    // Reset account button to default logo avatar
    elements.accountBtn.innerHTML = `<img src="icons/icon48.png" alt="Account" class="default-avatar">`;
    elements.accountBtn.classList.remove('signed-in');
  }
}

// ============================================
// Initialization
// ============================================

async function init() {
  initEventListeners();

  // Check auth status first
  await checkAuthStatus();
  updateAuthUI();

  await loadSavedAnalyses();

  // Check for Pinterest token
  const result = await chrome.storage.local.get(['pinterestToken']);
  if (result.pinterestToken) {
    state.pinterestToken = result.pinterestToken;
  }

  // Check for ongoing image analysis (in case popup was closed mid-analysis)
  const ongoingImageAnalysis = await checkForOngoingImageAnalysis();
  if (ongoingImageAnalysis) {
    console.log('Prometheus popup: Found ongoing image analysis, restoring UI');
    restoreImageAnalysisUI(ongoingImageAnalysis);
    return; // Don't check for other analyses
  }

  // Check for ongoing board analysis (in case popup was closed mid-analysis)
  const ongoingBoardAnalysis = await checkForOngoingBoardAnalysis();
  if (ongoingBoardAnalysis) {
    console.log('Prometheus popup: Found ongoing board analysis, restoring UI');
    restoreBoardAnalysisUI(ongoingBoardAnalysis);
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
