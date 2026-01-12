/**
 * Prometheus - Options Script
 * Handles loading and saving extension settings
 */

document.addEventListener('DOMContentLoaded', () => {
    // API Key elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const apiMessage = document.getElementById('apiMessage');

    // Account elements
    const accountName = document.getElementById('accountName');
    const accountEmail = document.getElementById('accountEmail');
    const signInBtn = document.getElementById('signInBtn');

    // Preference elements
    const notificationsToggle = document.getElementById('notificationsToggle');
    const autoSaveToggle = document.getElementById('autoSaveToggle');

    // Integration elements
    const pinterestStatus = document.getElementById('pinterestStatus');
    const connectPinterest = document.getElementById('connectPinterest');

    // Data management
    const clearDataBtn = document.getElementById('clearData');

    let currentUser = null;

    // Load current settings
    loadSettings();
    checkAuthStatus();

    function loadSettings() {
        chrome.storage.local.get(['settings', 'pinterestToken', 'geminiApiKey'], (result) => {
            const settings = result.settings || {
                notifications: true,
                autoSave: false
            };

            notificationsToggle.checked = settings.notifications;
            autoSaveToggle.checked = settings.autoSave;

            if (result.pinterestToken) {
                updatePinterestUI(true);
            }

            // Show masked API key if exists
            if (result.geminiApiKey) {
                apiKeyInput.value = '••••••••••••••••••••••••';
                apiKeyInput.dataset.hasKey = 'true';
                showApiMessage('API key configured', 'success');
            }
        });
    }

    function checkAuthStatus() {
        chrome.runtime.sendMessage({ action: 'getAuthStatus' }, (response) => {
            if (response?.success && response.data) {
                currentUser = response.data.user;
                updateAccountUI(response.data.authenticated, response.data.user);
            }
        });
    }

    // ============================================
    // API Key Handling
    // ============================================

    function showApiMessage(message, type) {
        apiMessage.textContent = message;
        apiMessage.className = 'api-message ' + type;
    }

    saveApiKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();

        // If showing masked key and user hasn't changed it, ignore
        if (key === '••••••••••••••••••••••••' && apiKeyInput.dataset.hasKey === 'true') {
            showApiMessage('API key already saved', 'success');
            return;
        }

        if (!key || key.length < 20) {
            showApiMessage('Please enter a valid API key', 'error');
            return;
        }

        // Save the API key
        saveApiKeyBtn.classList.add('loading');
        saveApiKeyBtn.disabled = true;

        try {
            // Quick validation by making a simple test request
            const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
            const response = await fetch(testUrl);

            if (response.ok) {
                chrome.storage.local.set({ geminiApiKey: key }, () => {
                    apiKeyInput.value = '••••••••••••••••••••••••';
                    apiKeyInput.dataset.hasKey = 'true';
                    showApiMessage('API key saved successfully!', 'success');
                });
            } else if (response.status === 400 || response.status === 403) {
                showApiMessage('Invalid API key. Please check and try again.', 'error');
            } else {
                // Save anyway if we can't validate (might be rate limited)
                chrome.storage.local.set({ geminiApiKey: key }, () => {
                    apiKeyInput.value = '••••••••••••••••••••••••';
                    apiKeyInput.dataset.hasKey = 'true';
                    showApiMessage('API key saved (could not verify)', 'success');
                });
            }
        } catch (error) {
            // Network error - save anyway
            chrome.storage.local.set({ geminiApiKey: key }, () => {
                apiKeyInput.value = '••••••••••••••••••••••••';
                apiKeyInput.dataset.hasKey = 'true';
                showApiMessage('API key saved', 'success');
            });
        } finally {
            saveApiKeyBtn.classList.remove('loading');
            saveApiKeyBtn.disabled = false;
        }
    });

    // Clear masked value on focus to allow entering new key
    apiKeyInput.addEventListener('focus', () => {
        if (apiKeyInput.dataset.hasKey === 'true' && apiKeyInput.value === '••••••••••••••••••••••••') {
            apiKeyInput.value = '';
            apiKeyInput.type = 'text';
        }
    });

    apiKeyInput.addEventListener('blur', () => {
        if (apiKeyInput.value === '' && apiKeyInput.dataset.hasKey === 'true') {
            apiKeyInput.value = '••••••••••••••••••••••••';
            apiKeyInput.type = 'password';
        }
    });

    // ============================================
    // Account Handling
    // ============================================

    function updateAccountUI(isAuthenticated, user) {
        if (isAuthenticated && user) {
            accountName.textContent = user.displayName || 'User';
            accountEmail.textContent = user.email;
            signInBtn.textContent = 'Sign Out';
            signInBtn.classList.remove('btn-secondary');
            signInBtn.classList.add('btn-danger');
        } else {
            accountName.textContent = 'Not signed in';
            accountEmail.textContent = 'Sign in to sync your saved analyses across devices';
            signInBtn.textContent = 'Sign In';
            signInBtn.classList.remove('btn-danger');
            signInBtn.classList.add('btn-secondary');
        }
    }

    signInBtn.addEventListener('click', async () => {
        if (currentUser) {
            // Sign out
            signInBtn.disabled = true;
            signInBtn.textContent = 'Signing out...';

            chrome.runtime.sendMessage({ action: 'signOut' }, (response) => {
                if (response?.success) {
                    currentUser = null;
                    updateAccountUI(false, null);
                } else {
                    alert('Sign out failed: ' + (response?.error || 'Unknown error'));
                }
                signInBtn.disabled = false;
            });
        } else {
            // Sign in
            signInBtn.disabled = true;
            signInBtn.textContent = 'Signing in...';

            chrome.runtime.sendMessage({ action: 'signIn' }, (response) => {
                if (response?.success) {
                    currentUser = response.data.user;
                    updateAccountUI(true, response.data.user);
                } else {
                    alert('Sign in failed: ' + (response?.error || 'Unknown error'));
                }
                signInBtn.disabled = false;
            });
        }
    });

    // ============================================
    // Preferences
    // ============================================

    notificationsToggle.addEventListener('change', saveSettings);
    autoSaveToggle.addEventListener('change', saveSettings);

    function saveSettings() {
        const settings = {
            notifications: notificationsToggle.checked,
            autoSave: autoSaveToggle.checked
        };

        chrome.storage.local.set({ settings }, () => {
            console.log('Settings saved');
        });
    }

    // ============================================
    // Pinterest Integration
    // ============================================

    connectPinterest.addEventListener('click', () => {
        chrome.storage.local.get(['pinterestToken'], (result) => {
            if (result.pinterestToken) {
                chrome.storage.local.remove(['pinterestToken'], () => {
                    updatePinterestUI(false);
                });
            } else {
                // TODO: Implement actual Pinterest OAuth
                chrome.storage.local.set({ pinterestToken: 'dummy-token' }, () => {
                    updatePinterestUI(true);
                });
            }
        });
    });

    function updatePinterestUI(connected) {
        const actionsContainer = pinterestStatus.querySelector('.integration-actions');
        const badge = actionsContainer.querySelector('.status-badge');
        const btn = actionsContainer.querySelector('button');

        if (connected) {
            badge.textContent = 'Connected';
            badge.classList.add('connected');
            btn.textContent = 'Disconnect';
        } else {
            badge.textContent = 'Not connected';
            badge.classList.remove('connected');
            btn.textContent = 'Connect';
        }
    }

    // ============================================
    // Data Management
    // ============================================

    clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            // Keep auth data and API key, only clear analyses and collections
            chrome.storage.local.get(['authUser', 'authIdToken', 'authTokenExpiry', 'authRefreshToken', 'geminiApiKey'], (preserved) => {
                chrome.storage.local.clear(() => {
                    // Restore preserved data
                    const toRestore = {};
                    if (preserved.geminiApiKey) toRestore.geminiApiKey = preserved.geminiApiKey;
                    if (preserved.authUser) {
                        toRestore.authUser = preserved.authUser;
                        toRestore.authIdToken = preserved.authIdToken;
                        toRestore.authTokenExpiry = preserved.authTokenExpiry;
                        toRestore.authRefreshToken = preserved.authRefreshToken;
                    }

                    if (Object.keys(toRestore).length > 0) {
                        chrome.storage.local.set(toRestore, () => {
                            alert('All saved analyses and collections cleared.');
                            window.location.reload();
                        });
                    } else {
                        alert('All data cleared.');
                        window.location.reload();
                    }
                });
            });
        }
    });
});
