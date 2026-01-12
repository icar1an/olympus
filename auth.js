/**
 * Prometheus - Authentication Module
 *
 * Handles Google Sign-In via Chrome Identity API and Firebase token exchange.
 * Works without Firebase SDK by using REST APIs directly.
 */

import { CONFIG } from './config.js';

// Firebase Auth REST API endpoint
const FIREBASE_AUTH_API = 'https://identitytoolkit.googleapis.com/v1';

// Cached auth state
let cachedIdToken = null;
let tokenExpiry = null;
let currentUser = null;

/**
 * Get the Web Client ID for OAuth
 * This should match the Web client ID in Firebase Console > Authentication > Sign-in method > Google
 */
function getWebClientId() {
    // Use the Web client ID from Firebase Console (not the Chrome app client ID from manifest.json)
    // You can find this in Firebase Console > Authentication > Sign-in method > Google > Web SDK configuration
    return '707111034542-3kc32gau3kbb5rah01ri46jvdgjsha18.apps.googleusercontent.com';
}

/**
 * Sign in with Google using Chrome Identity API
 * Uses launchWebAuthFlow to get an ID token that Firebase will accept
 * @returns {Promise<{user: Object, idToken: string}>}
 */
export async function signInWithGoogle() {
    console.log('Auth: Starting Google Sign-In...');

    const webClientId = getWebClientId();
    const redirectUri = chrome.identity.getRedirectURL();
    const nonce = Math.random().toString(36).substring(2);

    console.log('Auth: Using redirect URI:', redirectUri);
    console.log('Auth: Using Web client ID:', webClientId);

    // Build the Google OAuth URL to get an ID token
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', webClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'select_account');

    // Use launchWebAuthFlow to get the ID token
    const responseUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
            { url: authUrl.toString(), interactive: true },
            (callbackUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (!callbackUrl) {
                    reject(new Error('No callback URL received'));
                } else {
                    resolve(callbackUrl);
                }
            }
        );
    });

    console.log('Auth: Got OAuth callback');

    // Extract ID token from the callback URL fragment
    const hashParams = new URLSearchParams(responseUrl.split('#')[1]);
    const googleIdToken = hashParams.get('id_token');

    if (!googleIdToken) {
        throw new Error('No ID token in callback. Check Web client ID configuration.');
    }

    console.log('Auth: Got Google ID token');

    // Exchange Google ID token for Firebase ID token
    const firebaseResponse = await fetch(
        `${FIREBASE_AUTH_API}/accounts:signInWithIdp?key=${CONFIG.firebase.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postBody: `id_token=${googleIdToken}&providerId=google.com`,
                requestUri: redirectUri,
                returnIdpCredential: true,
                returnSecureToken: true
            })
        }
    );

    if (!firebaseResponse.ok) {
        const error = await firebaseResponse.json();
        console.error('Auth: Firebase sign-in failed:', error);
        throw new Error(error.error?.message || 'Firebase sign-in failed');
    }

    const authResult = await firebaseResponse.json();
    console.log('Auth: Firebase sign-in successful');

    // Cache the token and user info
    cachedIdToken = authResult.idToken;
    const expiresInMs = parseInt(authResult.expiresIn || '3600') * 1000;
    tokenExpiry = Date.now() + expiresInMs - 60000; // Refresh 1 min early
    currentUser = {
        uid: authResult.localId,
        email: authResult.email,
        displayName: authResult.displayName || authResult.email?.split('@')[0],
        photoURL: authResult.photoUrl,
        emailVerified: authResult.emailVerified
    };

    console.log('Auth: Storing tokens - expiresIn:', authResult.expiresIn, 'tokenExpiry:', tokenExpiry);
    console.log('Auth: Token will expire in', Math.round((tokenExpiry - Date.now()) / 1000), 'seconds');
    console.log('Auth: Has refresh token:', !!authResult.refreshToken);

    // Persist to chrome.storage
    await chrome.storage.local.set({
        authUser: currentUser,
        authIdToken: cachedIdToken,
        authTokenExpiry: tokenExpiry,
        authRefreshToken: authResult.refreshToken
    });

    // Verify storage
    const verify = await chrome.storage.local.get(['authIdToken', 'authTokenExpiry']);
    console.log('Auth: Storage verified - hasToken:', !!verify.authIdToken, 'expiry:', verify.authTokenExpiry);

    return { user: currentUser, idToken: cachedIdToken };
}

/**
 * Get current Firebase ID token, refreshing if necessary
 * @returns {Promise<string|null>}
 */
export async function getIdToken() {
    console.log('Auth: getIdToken called');

    // Check if we have a valid cached token
    if (cachedIdToken && tokenExpiry && Date.now() < tokenExpiry) {
        console.log('Auth: Using cached token, expires in', Math.round((tokenExpiry - Date.now()) / 1000), 'seconds');
        return cachedIdToken;
    }

    // Try to restore from storage
    console.log('Auth: No valid cached token, checking storage...');
    const stored = await chrome.storage.local.get([
        'authIdToken', 'authTokenExpiry', 'authRefreshToken'
    ]);

    console.log('Auth: Storage check - hasToken:', !!stored.authIdToken, 'hasExpiry:', !!stored.authTokenExpiry, 'hasRefresh:', !!stored.authRefreshToken);

    // If stored token is still valid, use it
    if (stored.authIdToken && stored.authTokenExpiry) {
        const timeRemaining = stored.authTokenExpiry - Date.now();
        console.log('Auth: Stored token time remaining:', Math.round(timeRemaining / 1000), 'seconds');

        if (timeRemaining > 0) {
            cachedIdToken = stored.authIdToken;
            tokenExpiry = stored.authTokenExpiry;
            console.log('Auth: Restored valid token from storage');
            return cachedIdToken;
        } else {
            console.log('Auth: Stored token expired, will try refresh');
        }
    }

    // Try to refresh the token
    if (stored.authRefreshToken) {
        try {
            console.log('Auth: Attempting token refresh...');
            const refreshed = await refreshIdToken(stored.authRefreshToken);
            return refreshed;
        } catch (error) {
            console.warn('Auth: Token refresh failed:', error.message);
            // Clear invalid auth state
            await signOut();
            return null;
        }
    }

    console.log('Auth: No token available');
    return null;
}

/**
 * Refresh the Firebase ID token using refresh token
 * @param {string} refreshToken
 * @returns {Promise<string>}
 */
async function refreshIdToken(refreshToken) {
    console.log('Auth: Refreshing ID token...');

    const response = await fetch(
        `https://securetoken.googleapis.com/v1/token?key=${CONFIG.firebase.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${refreshToken}`
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Token refresh failed');
    }

    const result = await response.json();

    // Update cached values
    cachedIdToken = result.id_token;
    tokenExpiry = Date.now() + (parseInt(result.expires_in) * 1000) - 60000;

    // Persist updated token
    await chrome.storage.local.set({
        authIdToken: cachedIdToken,
        authTokenExpiry: tokenExpiry,
        authRefreshToken: result.refresh_token
    });

    console.log('Auth: Token refreshed successfully');
    return cachedIdToken;
}

/**
 * Get the current authenticated user
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
    if (currentUser) {
        return currentUser;
    }

    const stored = await chrome.storage.local.get(['authUser']);
    if (stored.authUser) {
        currentUser = stored.authUser;
        return currentUser;
    }

    return null;
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
    console.log('Auth: isAuthenticated check starting...');
    const token = await getIdToken();
    const result = token !== null;
    console.log('Auth: isAuthenticated result:', result);
    return result;
}

/**
 * Sign out the current user
 */
export async function signOut() {
    console.log('Auth: Signing out...');

    // Clear cached state
    cachedIdToken = null;
    tokenExpiry = null;
    currentUser = null;

    // Clear stored auth data
    await chrome.storage.local.remove([
        'authUser', 'authIdToken', 'authTokenExpiry', 'authRefreshToken'
    ]);

    // Revoke Chrome identity token
    try {
        const token = await new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, resolve);
        });
        if (token) {
            await new Promise((resolve) => {
                chrome.identity.removeCachedAuthToken({ token }, resolve);
            });
            // Also revoke the token on Google's servers
            await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        }
    } catch (error) {
        console.warn('Auth: Error revoking token:', error.message);
    }

    console.log('Auth: Signed out successfully');
}

/**
 * Initialize auth state from storage
 * Call this when the extension starts
 */
export async function initAuth() {
    const stored = await chrome.storage.local.get(['authUser', 'authIdToken', 'authTokenExpiry']);

    if (stored.authUser) {
        currentUser = stored.authUser;
    }
    if (stored.authIdToken && stored.authTokenExpiry) {
        cachedIdToken = stored.authIdToken;
        tokenExpiry = stored.authTokenExpiry;
    }

    console.log('Auth: Initialized, user:', currentUser?.email || 'none');
    return currentUser;
}

export default {
    signInWithGoogle,
    getIdToken,
    getCurrentUser,
    isAuthenticated,
    signOut,
    initAuth
};
