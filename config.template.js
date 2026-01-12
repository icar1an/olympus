/**
 * Prometheus Configuration Template
 * 
 * Copy this file to config.js and fill in your values.
 * Do NOT commit config.js to version control.
 */

export const CONFIG = {
  // Firebase Configuration
  // Get these values from your Firebase Console > Project Settings
  firebase: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'your-project-id.firebaseapp.com',
    projectId: 'your-project-id',
    storageBucket: 'your-project-id.appspot.com',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },

  // Pinterest API Configuration
  // Get these from Pinterest Developer Portal
  pinterest: {
    clientId: 'YOUR_PINTEREST_CLIENT_ID',
    clientSecret: 'YOUR_PINTEREST_CLIENT_SECRET', // Only use server-side!
    scope: 'boards:read,pins:read'
  },

  // Firebase Cloud Functions URLs
  // Update these after deploying your functions
  functions: {
    baseUrl: 'https://us-central1-your-project-id.cloudfunctions.net',
    endpoints: {
      analyze: '/analyze',
      generateCard: '/generateCard',
      getRunwayReferences: '/getRunwayReferences'
    }
  },

  // Feature Flags
  features: {
    pinterestIntegration: true,
    shareableCards: true,
    runwayReferences: true,
    collections: true
  },

  // Analytics (optional)
  analytics: {
    enabled: false,
    measurementId: 'G-XXXXXXXXXX'
  }
};

// Export for use in modules
export default CONFIG;
