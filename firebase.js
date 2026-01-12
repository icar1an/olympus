/**
 * Prometheus - Firebase Integration Module
 * 
 * Best Practices for Chrome Extensions:
 * 1. Uses Firebase Web SDK (not Service Account) for browser-safe auth
 * 2. Modular SDK imports for Manifest V3 compatibility
 * 3. Centralized Firebase initialization 
 * 4. Auth state persistence in chrome.storage
 * 5. Token refresh handling for long-running sessions
 * 
 * Note: For production, you should:
 * - Restrict your API key in Google Cloud Console
 * - Add your extension ID to Firebase Console's authorized domains
 * - Enable only the Firebase services you need
 */

import { CONFIG } from './config.js';

// Firebase SDK URLs (using compat builds for simplicity in extensions)
// For production, consider bundling with Webpack/Vite
const FIREBASE_SDK_VERSION = '10.7.1';
const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

// Firebase instances (initialized lazily)
let firebaseApp = null;
let firebaseAuth = null;
let firebaseFirestore = null;

/**
 * Dynamically load Firebase SDK scripts
 * Note: Remote scripts cannot be loaded in MV3 service workers.
 * This function is kept for compatibility but will not attempt to load from CDN.
 */
async function loadFirebaseSDK() {
    if (typeof firebase !== 'undefined') {
        return; // Already loaded
    }

    console.warn('Firebase SDK: Remote loading via importScripts is not supported in MV3 module service workers.');
    console.warn('To enable Firebase, you must download the SDK files locally and import them or bundle your extension.');
}

/**
 * Initialize Firebase App
 * Call this before using any Firebase services
 */
export async function initializeFirebase() {
    if (firebaseApp) {
        return firebaseApp;
    }

    await loadFirebaseSDK();

    if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK (global) not found. Firebase features will be disabled.');
        return null;
    }

    // Initialize Firebase
    firebaseApp = firebase.initializeApp(CONFIG.firebase);
    firebaseAuth = firebase.auth();
    firebaseFirestore = firebase.firestore();

    // Restore auth state from chrome.storage
    await restoreAuthState();

    // Listen for auth state changes
    firebaseAuth.onAuthStateChanged(async (user) => {
        if (user) {
            // Store user info in chrome.storage
            await chrome.storage.local.set({
                firebaseUser: {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    emailVerified: user.emailVerified
                }
            });
        } else {
            await chrome.storage.local.remove('firebaseUser');
        }
    });

    return firebaseApp;
}

/**
 * Restore auth state from chrome.storage
 * Useful when service worker restarts
 */
async function restoreAuthState() {
    const { firebaseAuthToken } = await chrome.storage.local.get('firebaseAuthToken');

    if (firebaseAuthToken) {
        try {
            await firebaseAuth.signInWithCustomToken(firebaseAuthToken);
        } catch (error) {
            // Token expired or invalid, clear it
            await chrome.storage.local.remove('firebaseAuthToken');
        }
    }
}

/**
 * Get the Firebase Auth instance
 */
export function getAuth() {
    if (!firebaseAuth) {
        throw new Error('Firebase not initialized. Call initializeFirebase() first.');
    }
    return firebaseAuth;
}

/**
 * Get the Firestore instance
 */
export function getFirestore() {
    if (!firebaseFirestore) {
        throw new Error('Firebase not initialized. Call initializeFirebase() first.');
    }
    return firebaseFirestore;
}

/**
 * Get the current user
 */
export async function getCurrentUser() {
    const auth = getAuth();
    return auth.currentUser;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email, password) {
    const auth = getAuth();
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    return userCredential.user;
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email, password) {
    const auth = getAuth();
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    return userCredential.user;
}

/**
 * Sign in with Google using Chrome Identity API
 * This is the recommended approach for Chrome extensions
 */
export async function signInWithGoogle() {
    const auth = getAuth();

    // Use chrome.identity to get an OAuth token
    const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(token);
            }
        });
    });

    // Create a Google credential with the token
    const credential = firebase.auth.GoogleAuthProvider.credential(null, token);

    // Sign in with the credential
    const userCredential = await auth.signInWithCredential(credential);
    return userCredential.user;
}

/**
 * Sign out
 */
export async function signOut() {
    const auth = getAuth();
    await auth.signOut();

    // Also revoke the Chrome identity token if present
    try {
        const token = await new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, resolve);
        });
        if (token) {
            await new Promise((resolve) => {
                chrome.identity.removeCachedAuthToken({ token }, resolve);
            });
        }
    } catch (error) {
        // Ignore errors when clearing Chrome identity
    }
}

/**
 * Call a Firebase Cloud Function
 */
export async function callFunction(functionName, data = {}) {
    const url = `${CONFIG.functions.baseUrl}${CONFIG.functions.endpoints[functionName] || `/${functionName}`}`;

    // Get the current user's ID token for authenticated requests
    let authHeader = {};
    const auth = getAuth();
    if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        authHeader = { 'Authorization': `Bearer ${token}` };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `Function ${functionName} failed`);
    }

    return response.json();
}

// ============================================
// Firestore Helper Functions
// ============================================

/**
 * Save an analysis to Firestore
 */
export async function saveAnalysis(analysis) {
    const db = getFirestore();
    const user = await getCurrentUser();

    if (!user) {
        // Save locally if not authenticated
        const { savedAnalyses = [] } = await chrome.storage.local.get('savedAnalyses');
        savedAnalyses.push({ ...analysis, savedAt: Date.now() });
        await chrome.storage.local.set({ savedAnalyses });
        return { id: `local_${Date.now()}`, ...analysis };
    }

    // Save to Firestore
    const docRef = await db.collection('users').doc(user.uid)
        .collection('analyses').add({
            ...analysis,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            userId: user.uid
        });

    return { id: docRef.id, ...analysis };
}

/**
 * Get user's saved analyses
 */
export async function getAnalyses(limit = 10) {
    const db = getFirestore();
    const user = await getCurrentUser();

    if (!user) {
        // Return local analyses if not authenticated
        const { savedAnalyses = [] } = await chrome.storage.local.get('savedAnalyses');
        return savedAnalyses.slice(-limit).reverse();
    }

    // Get from Firestore
    const snapshot = await db.collection('users').doc(user.uid)
        .collection('analyses')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Delete an analysis
 */
export async function deleteAnalysis(analysisId) {
    const db = getFirestore();
    const user = await getCurrentUser();

    if (!user || analysisId.startsWith('local_')) {
        // Delete from local storage
        const { savedAnalyses = [] } = await chrome.storage.local.get('savedAnalyses');
        const filtered = savedAnalyses.filter(a => a.id !== analysisId);
        await chrome.storage.local.set({ savedAnalyses: filtered });
        return;
    }

    await db.collection('users').doc(user.uid)
        .collection('analyses').doc(analysisId).delete();
}

// ============================================
// Collections Management
// ============================================

/**
 * Create a new collection
 */
export async function createCollection(name, description = '') {
    const db = getFirestore();
    const user = await getCurrentUser();

    if (!user) {
        const { collections = [] } = await chrome.storage.local.get('collections');
        const newCollection = {
            id: `local_${Date.now()}`,
            name,
            description,
            analyses: [],
            createdAt: Date.now()
        };
        collections.push(newCollection);
        await chrome.storage.local.set({ collections });
        return newCollection;
    }

    const docRef = await db.collection('users').doc(user.uid)
        .collection('collections').add({
            name,
            description,
            analyses: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            userId: user.uid
        });

    return { id: docRef.id, name, description, analyses: [] };
}

/**
 * Get user's collections
 */
export async function getCollections() {
    const db = getFirestore();
    const user = await getCurrentUser();

    if (!user) {
        const { collections = [] } = await chrome.storage.local.get('collections');
        return collections;
    }

    const snapshot = await db.collection('users').doc(user.uid)
        .collection('collections')
        .orderBy('createdAt', 'desc')
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Add analysis to a collection
 */
export async function addToCollection(collectionId, analysisId) {
    const db = getFirestore();
    const user = await getCurrentUser();

    if (!user || collectionId.startsWith('local_')) {
        const { collections = [] } = await chrome.storage.local.get('collections');
        const collection = collections.find(c => c.id === collectionId);
        if (collection) {
            collection.analyses.push(analysisId);
            await chrome.storage.local.set({ collections });
        }
        return;
    }

    await db.collection('users').doc(user.uid)
        .collection('collections').doc(collectionId).update({
            analyses: firebase.firestore.FieldValue.arrayUnion(analysisId)
        });
}

// Export for use in other modules
export default {
    initializeFirebase,
    getAuth,
    getFirestore,
    getCurrentUser,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    callFunction,
    saveAnalysis,
    getAnalyses,
    deleteAnalysis,
    createCollection,
    getCollections,
    addToCollection
};
