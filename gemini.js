/**
 * Prometheus - Gemini AI Service
 * Routes all API calls through Firebase Cloud Function
 * Requires user authentication - no personal API key needed
 */

import { CONFIG } from './config.js';

// ============================================
// Authentication Helper
// ============================================

/**
 * Get the current user's Firebase ID token
 * Uses auth.js storage keys and handles token refresh
 * @returns {Promise<string|null>}
 */
async function getIdToken() {
    const stored = await chrome.storage.local.get(['authIdToken', 'authTokenExpiry', 'authRefreshToken']);

    // Check if token exists and is not expired
    if (stored.authIdToken && stored.authTokenExpiry) {
        if (Date.now() < stored.authTokenExpiry) {
            return stored.authIdToken;
        }

        // Token expired, try to refresh
        if (stored.authRefreshToken) {
            try {
                const refreshed = await refreshToken(stored.authRefreshToken);
                return refreshed;
            } catch (error) {
                console.error('GeminiService: Token refresh failed:', error);
                return null;
            }
        }
    }

    return null;
}

/**
 * Refresh the Firebase ID token
 * @param {string} refreshToken
 * @returns {Promise<string>}
 */
async function refreshToken(refreshTokenValue) {
    const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${CONFIG.firebase.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${refreshTokenValue}`
        }
    );

    if (!response.ok) {
        throw new Error('Token refresh failed');
    }

    const result = await response.json();
    const newToken = result.id_token;
    const newExpiry = Date.now() + (parseInt(result.expires_in) * 1000) - 60000;

    // Update storage
    await chrome.storage.local.set({
        authIdToken: newToken,
        authTokenExpiry: newExpiry,
        authRefreshToken: result.refresh_token
    });

    return newToken;
}

/**
 * Check if user is signed in
 * @returns {Promise<boolean>}
 */
async function isSignedIn() {
    const { authUser } = await chrome.storage.local.get('authUser');
    return !!authUser;
}

// ============================================
// Image Preparation
// ============================================

/**
 * Convert an image URL to base64 for the API
 * @param {string} imageUrl - The image URL or data URL
 * @returns {Promise<{data: string, mimeType: string}>}
 */
async function prepareImageData(imageUrl) {
    console.log('GeminiService: Preparing image data');

    // If already a data URL, extract the base64 part
    if (imageUrl.startsWith('data:')) {
        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
            return {
                mimeType: matches[1],
                data: matches[2]
            };
        }
    }

    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // Convert ArrayBuffer to Base64
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);

        return {
            mimeType: blob.type || 'image/png',
            data: base64
        };
    } catch (error) {
        console.error('GeminiService: Error preparing image:', error);
        throw error;
    }
}

// ============================================
// Image Analysis via Cloud Function
// ============================================

/**
 * Analyze a fashion image using the Cloud Function
 * Requires user to be signed in
 * @param {string} imageSource - Image URL or data URL
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeImage(imageSource) {
    console.log('GeminiService: Starting analysis via Cloud Function');

    // Check if user is signed in
    const signedIn = await isSignedIn();
    if (!signedIn) {
        throw new Error('Please sign in to analyze images. Authentication is required to use this feature.');
    }

    // Get the ID token
    const idToken = await getIdToken();
    if (!idToken) {
        throw new Error('Authentication token not found. Please sign out and sign in again.');
    }

    // Prepare image data
    const imageData = await prepareImageData(imageSource);

    // Call the Cloud Function
    const functionUrl = CONFIG.functions.analyzeImageUrl;

    let response;
    try {
        response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                imageData: imageData.data,
                mimeType: imageData.mimeType
            })
        });
    } catch (fetchError) {
        console.error('GeminiService: Network error:', fetchError);
        throw new Error('Network error calling analysis service: ' + fetchError.message);
    }

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error('GeminiService: API error:', response.status, errorBody);

        if (response.status === 401) {
            throw new Error('Session expired. Please sign out and sign in again.');
        } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        } else if (response.status === 500) {
            throw new Error(errorBody.error || 'Server error. Please try again later.');
        }

        throw new Error(errorBody.error || `Analysis failed: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
        throw new Error('Invalid response from analysis service');
    }

    console.log('GeminiService: Analysis complete:', result.data.aestheticName);
    return result.data;
}

/**
 * Check if the service is ready
 * @returns {Promise<{ready: boolean, error?: string, needsSignIn?: boolean}>}
 */
export async function checkServiceStatus() {
    try {
        const signedIn = await isSignedIn();

        if (!signedIn) {
            return {
                ready: false,
                needsSignIn: true,
                error: 'Please sign in to use the analysis feature.'
            };
        }

        const idToken = await getIdToken();
        if (!idToken) {
            return {
                ready: false,
                needsSignIn: true,
                error: 'Authentication token missing. Please sign out and sign in again.'
            };
        }

        return { ready: true };
    } catch (error) {
        return {
            ready: false,
            error: 'Unable to check service status: ' + error.message
        };
    }
}

export default {
    analyzeImage,
    checkServiceStatus
};
