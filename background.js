/**
 * Prometheus - Background Service Worker
 * Handles extension lifecycle, message passing, and Firebase integration
 */

console.log('Prometheus background: Service worker starting...');

import { CONFIG } from './config.js';
import { analyzeImage as geminiAnalyzeImage, checkServiceStatus } from './gemini.js';
import { initAuth, signInWithGoogle, signOut, getCurrentUser, isAuthenticated, getIdToken } from './auth.js';

console.log('Prometheus background: Modules imported successfully');

// Initialize auth state when service worker starts
initAuth()
  .then(user => {
    if (user) {
      console.log('Prometheus background: User authenticated:', user.email);
    } else {
      console.log('Prometheus background: No authenticated user');
    }
  })
  .catch(err => {
    console.warn('Prometheus background: Auth initialization failed:', err.message);
  });

// ============================================
// Installation Handler
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Prometheus installed');

    // Initialize storage with defaults
    chrome.storage.local.set({
      savedAnalyses: [],
      collections: [],
      settings: {
        notifications: true,
        autoSave: false
      }
    });
  } else if (details.reason === 'update') {
    console.log('Prometheus updated to version', chrome.runtime.getManifest().version);
  }
});

// ============================================
// Message Handlers
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Prometheus background: Received message:', message.action, 'from:', sender.tab?.id || 'popup');
  switch (message.action) {
    case 'analyzeImage':
      console.log('Prometheus background: Starting analyzeImage for:', message.imageUrl?.substring(0, 80));
      handleAnalyzeImage(message.imageUrl)
        .then(result => {
          console.log('Prometheus background: Analysis successful');
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          console.error('Prometheus background: Analysis failed:', error.message);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    case 'generateCard':
      handleGenerateCard(message.analysis)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getRunwayReferences':
      handleGetRunwayReferences(message.aestheticName)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'capturedImage':
    case 'imageCaptured':
      // Start background analysis instead of opening popup
      console.log('Prometheus background: Received capturedImage, URL length:', message.imageUrl?.length);

      if (!message.imageUrl) {
        console.error('Prometheus background: No imageUrl provided in capturedImage');
        sendResponse({ success: false, error: 'No image URL provided' });
        return true;
      }

      // Start analysis in background (no popup)
      handleStartImageAnalysis(message.imageUrl)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'openPopup':
      // Can't programmatically open popup, but can open a tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('popup.html')
      });
      sendResponse({ success: true });
      break;

    case 'checkGeminiStatus':
      checkServiceStatus()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'signIn':
      signInWithGoogle()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'signOut':
      signOut()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getAuthStatus':
      Promise.all([getCurrentUser(), isAuthenticated()])
        .then(([user, authenticated]) => {
          sendResponse({ success: true, data: { user, authenticated } });
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getIdToken':
      getIdToken()
        .then(idToken => {
          if (idToken) {
            sendResponse({ success: true, idToken });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'startBoardAnalysis':
      handleStartBoardAnalysis(message.boardId, message.boardName, message.boardPinCount, message.pins, message.pinterestToken)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getBoardAnalysisStatus':
      handleGetBoardAnalysisStatus()
        .then(status => sendResponse({ success: true, data: status }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'cancelBoardAnalysis':
      handleCancelBoardAnalysis()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'startImageAnalysis':
      handleStartImageAnalysis(message.imageUrl)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getImageAnalysisStatus':
      handleGetImageAnalysisStatus()
        .then(status => sendResponse({ success: true, data: status }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'cancelImageAnalysis':
      handleCancelImageAnalysis()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// ============================================
// Gemini Analysis
// ============================================

async function handleAnalyzeImage(imageUrl) {
  console.log('Prometheus background: handleAnalyzeImage called');
  console.log('Prometheus background: Image URL length:', imageUrl?.length || 0);

  // Check if Gemini is configured
  console.log('Prometheus background: Checking service status...');
  const status = await checkServiceStatus();
  console.log('Prometheus background: Service status:', status);

  if (!status.ready) {
    console.error('Prometheus background: Service not ready:', status.error);
    throw new Error(status.error || 'Gemini API not configured. Please set your API key in the extension options.');
  }

  // Use Gemini to analyze the image
  console.log('Prometheus background: Calling geminiAnalyzeImage...');
  const analysis = await geminiAnalyzeImage(imageUrl);
  console.log('Prometheus background: Analysis complete:', analysis?.aestheticName);

  return analysis;
}

async function handleGenerateCard(analysis) {
  // PLACEHOLDER: Replace with actual Firebase function call
  // This would generate a shareable card image and return a URL
  /*
  const response = await fetch(`${FUNCTIONS_BASE}/generateCard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ analysis })
  });
  
  if (!response.ok) {
    throw new Error('Card generation failed');
  }
  
  return await response.json();
  */

  return {
    cardUrl: `https://prometheus.app/card/${Date.now()}`,
    imageUrl: `https://storage.googleapis.com/prometheus-cards/${Date.now()}.png`
  };
}

async function handleGetRunwayReferences(aestheticName) {
  // PLACEHOLDER: Replace with actual Firebase function call
  /*
  const response = await fetch(`${FUNCTIONS_BASE}/getRunwayReferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ aestheticName })
  });
  
  if (!response.ok) {
    throw new Error('Failed to get references');
  }
  
  return await response.json();
  */

  return [
    {
      designer: 'Yohji Yamamoto',
      collection: 'Fall 2020',
      url: 'https://www.vogue.com/fashion-shows/fall-2020-ready-to-wear/yohji-yamamoto'
    },
    {
      designer: 'Rick Owens',
      collection: 'Spring 2023',
      url: 'https://www.vogue.com/fashion-shows/spring-2023-ready-to-wear/rick-owens'
    }
  ];
}

// ============================================
// Persistent Board Analysis
// ============================================

// In-memory tracker for ongoing analysis (survives popup close but not service worker restart)
let boardAnalysisController = null;

async function handleStartBoardAnalysis(boardId, boardName, boardPinCount, pins, pinterestToken) {
  console.log('Background: Starting board analysis for:', boardName, 'with', pins.length, 'pins (board total:', boardPinCount, ')');

  // Cancel any existing analysis
  if (boardAnalysisController) {
    boardAnalysisController.cancelled = true;
  }
  boardAnalysisController = { cancelled: false };

  // Cost-effective sampling: analyze max 8 pins
  const MAX_PINS_TO_ANALYZE = 8;
  const BATCH_SIZE = 3;

  // Random sampling for diverse board representation
  let sampledPins;
  if (pins.length <= MAX_PINS_TO_ANALYZE) {
    sampledPins = pins;
  } else {
    const shuffled = [...pins];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    sampledPins = shuffled.slice(0, MAX_PINS_TO_ANALYZE);
  }

  // Initialize state in storage
  const initialState = {
    status: 'analyzing',
    boardId,
    boardName,
    boardPinCount: boardPinCount || pins.length,
    totalPins: sampledPins.length,
    analyzedCount: 0,
    results: [],
    imageUrls: [],
    aggregateResults: null,
    error: null,
    startedAt: Date.now()
  };

  await chrome.storage.local.set({ boardAnalysisState: initialState });

  // Process pins in batches
  const results = [];
  const imageUrls = [];
  const currentController = boardAnalysisController;

  for (let i = 0; i < sampledPins.length; i += BATCH_SIZE) {
    // Check if cancelled
    if (currentController.cancelled) {
      console.log('Background: Board analysis cancelled');
      return;
    }

    const batch = sampledPins.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchPromises = batch.map(async (pin) => {
      try {
        const imageUrl = pin.media?.images?.['600x']?.url || pin.media?.images?.['400x300']?.url;
        if (!imageUrl) return null;

        const analysis = await handleAnalyzeImage(imageUrl);
        if (analysis) {
          return {
            pinId: pin.id,
            imageUrl: imageUrl,
            analysis: analysis
          };
        }
      } catch (error) {
        console.error(`Background: Failed to analyze pin ${pin.id}:`, error);
      }
      return null;
    });

    const batchResults = await Promise.all(batchPromises);

    // Add successful results
    batchResults.forEach(result => {
      if (result) {
        results.push(result);
        imageUrls.push(result.imageUrl);
      }
    });

    // Update progress in storage
    const progressState = {
      status: 'analyzing',
      boardId,
      boardName,
      boardPinCount: initialState.boardPinCount,
      totalPins: sampledPins.length,
      analyzedCount: Math.min(i + BATCH_SIZE, sampledPins.length),
      results: results,
      imageUrls: imageUrls,
      aggregateResults: null,
      error: null,
      startedAt: initialState.startedAt
    };
    await chrome.storage.local.set({ boardAnalysisState: progressState });

    // Small delay between batches
    if (i + BATCH_SIZE < sampledPins.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Aggregate final results
  const aggregateResults = aggregateBoardAnalyses(results);

  // Store final state
  const finalState = {
    status: 'complete',
    boardId,
    boardName,
    boardPinCount: initialState.boardPinCount,
    totalPins: sampledPins.length,
    analyzedCount: sampledPins.length,
    results: results,
    imageUrls: imageUrls,
    aggregateResults: aggregateResults,
    error: null,
    startedAt: initialState.startedAt,
    completedAt: Date.now()
  };
  await chrome.storage.local.set({ boardAnalysisState: finalState });

  console.log('Background: Board analysis complete');
}

async function handleGetBoardAnalysisStatus() {
  const { boardAnalysisState } = await chrome.storage.local.get('boardAnalysisState');
  return boardAnalysisState || { status: 'idle' };
}

async function handleCancelBoardAnalysis() {
  if (boardAnalysisController) {
    boardAnalysisController.cancelled = true;
  }
  await chrome.storage.local.remove('boardAnalysisState');
}

function aggregateBoardAnalyses(analyses) {
  if (!analyses || analyses.length === 0) {
    return null;
  }

  const aestheticCounts = {};
  const aestheticSummaries = {}; // Store summaries by aesthetic name
  const allGarments = [];
  const allRunwayRefs = [];

  analyses.forEach(item => {
    const analysis = item.analysis;

    if (analysis.aestheticName) {
      aestheticCounts[analysis.aestheticName] = (aestheticCounts[analysis.aestheticName] || 0) + 1;
      // Store the summary for this aesthetic (keep the first one we find)
      if (analysis.summary && !aestheticSummaries[analysis.aestheticName]) {
        aestheticSummaries[analysis.aestheticName] = analysis.summary;
      }
    }

    if (analysis.coreGarments) allGarments.push(...analysis.coreGarments);
    if (analysis.runwayReferences) allRunwayRefs.push(...analysis.runwayReferences);
  });

  // Get top aesthetics
  const topAesthetics = Object.entries(aestheticCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / analyses.length) * 100) }));

  // Helper for frequency counting
  const countOccurrences = (arr) => {
    const counts = {};
    arr.forEach(item => {
      const normalized = item.toLowerCase().trim();
      counts[normalized] = (counts[normalized] || 0) + 1;
    });
    return counts;
  };

  // Get most common garments
  const garmentCounts = countOccurrences(allGarments);
  const topGarments = Object.entries(garmentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);

  // Get top designers with collections
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
      collections: data.collections.slice(0, 3)
    }));

  const dominantAesthetic = topAesthetics[0]?.name || 'Mixed Aesthetics';
  const summary = aestheticSummaries[dominantAesthetic] || '';

  return {
    totalAnalyzed: analyses.length,
    topAesthetics,
    topGarments,
    topDesigners,
    dominantAesthetic,
    summary
  };
}

// ============================================
// Persistent Image Analysis
// ============================================

// In-memory tracker for ongoing image analysis
let imageAnalysisController = null;

async function handleStartImageAnalysis(imageUrl) {
  console.log('Background: Starting image analysis, URL length:', imageUrl?.length);

  // Cancel any existing analysis
  if (imageAnalysisController) {
    imageAnalysisController.cancelled = true;
  }
  imageAnalysisController = { cancelled: false };

  // Initialize state in storage
  const initialState = {
    status: 'analyzing',
    imageUrl: imageUrl,
    result: null,
    error: null,
    startedAt: Date.now()
  };

  await chrome.storage.local.set({ imageAnalysisState: initialState });

  const currentController = imageAnalysisController;

  try {
    // Check if cancelled before starting
    if (currentController.cancelled) {
      console.log('Background: Image analysis cancelled before start');
      return;
    }

    // Perform the analysis
    const analysis = await handleAnalyzeImage(imageUrl);

    // Check if cancelled after analysis
    if (currentController.cancelled) {
      console.log('Background: Image analysis cancelled after completion');
      return;
    }

    // Store successful result
    const finalState = {
      status: 'complete',
      imageUrl: imageUrl,
      result: analysis,
      error: null,
      startedAt: initialState.startedAt,
      completedAt: Date.now()
    };
    await chrome.storage.local.set({ imageAnalysisState: finalState });

    console.log('Background: Image analysis complete:', analysis?.aestheticName);
  } catch (error) {
    console.error('Background: Image analysis failed:', error);

    // Check if cancelled
    if (currentController.cancelled) {
      return;
    }

    // Store error state
    const errorState = {
      status: 'error',
      imageUrl: imageUrl,
      result: null,
      error: error.message || 'Analysis failed',
      startedAt: initialState.startedAt,
      completedAt: Date.now()
    };
    await chrome.storage.local.set({ imageAnalysisState: errorState });
  }
}

async function handleGetImageAnalysisStatus() {
  const { imageAnalysisState } = await chrome.storage.local.get('imageAnalysisState');
  return imageAnalysisState || { status: 'idle' };
}

async function handleCancelImageAnalysis() {
  if (imageAnalysisController) {
    imageAnalysisController.cancelled = true;
  }
  await chrome.storage.local.remove('imageAnalysisState');
}

// ============================================
// Context Menu
// ============================================

// Create context menu item for images
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'analyzeImage',
    title: 'Analyze with Prometheus',
    contexts: ['image']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'analyzeImage' && info.srcUrl) {
    // Start background analysis (no popup)
    handleStartImageAnalysis(info.srcUrl);
  }
});

// ============================================
// Tab Updates
// ============================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Inject content script on supported pages if needed
  if (changeInfo.status === 'complete' && tab.url) {
    // Only inject on http/https pages
    if (tab.url.startsWith('http')) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).catch(() => {
        // Script injection may fail on some pages (chrome://, etc.)
      });
    }
  }
});

// ============================================
// Alarm Handlers (for scheduled tasks)
// ============================================

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'syncData':
      // Sync saved data to Firebase
      handleDataSync();
      break;
  }
});

async function handleDataSync() {
  // PLACEHOLDER: Implement data sync with Firebase
  console.log('Syncing data...');
}

// Set up periodic sync (every 30 minutes)
chrome.alarms.create('syncData', { periodInMinutes: 30 });

// ============================================
// Error Handling
// ============================================

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

console.log('Prometheus background service worker loaded');
