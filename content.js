/**
 * Prometheus - Content Script
 * Handles image capture from web pages
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__prometheusInjected) return;
  window.__prometheusInjected = true;

  // ============================================
  // State
  // ============================================

  let captureMode = false;
  let overlay = null;
  let tooltip = null;
  let currentHighlight = null;

  // ============================================
  // UI Elements
  // ============================================

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'prometheus-overlay';
    overlay.innerHTML = `
      <div class="prometheus-overlay-content">
        <div class="prometheus-header">
          <span class="prometheus-logo">prometheus</span>
          <button class="prometheus-close" id="prometheus-close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <p class="prometheus-instruction">Click on any image to analyze its aesthetic</p>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close button handler
    overlay.querySelector('#prometheus-close').addEventListener('click', exitCaptureMode);

    // ESC key handler
    document.addEventListener('keydown', handleKeyDown);
  }

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = 'prometheus-tooltip';
    tooltip.textContent = 'Click to analyze';
    document.body.appendChild(tooltip);
  }

  function removeUI() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    if (currentHighlight) {
      currentHighlight.classList.remove('prometheus-highlight');
      currentHighlight = null;
    }
    document.removeEventListener('keydown', handleKeyDown);
  }

  // ============================================
  // Event Handlers
  // ============================================

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      exitCaptureMode();
    }
  }

  function handleMouseMove(e) {
    if (!captureMode) return;

    const target = e.target;

    // Remove highlight from previous element
    if (currentHighlight && currentHighlight !== target) {
      currentHighlight.classList.remove('prometheus-highlight');
    }

    // Check if target is an image
    if (isValidImage(target)) {
      target.classList.add('prometheus-highlight');
      currentHighlight = target;

      // Position tooltip
      if (tooltip) {
        tooltip.style.display = 'block';
        tooltip.style.left = e.pageX + 15 + 'px';
        tooltip.style.top = e.pageY + 15 + 'px';
      }
    } else {
      if (tooltip) {
        tooltip.style.display = 'none';
      }
      currentHighlight = null;
    }
  }

  function handleClick(e) {
    if (!captureMode) return;

    const target = e.target;
    if (isValidImage(target)) {
      e.preventDefault();
      e.stopPropagation();

      const imageUrl = getImageUrl(target);

      if (imageUrl) {
        // Warn about very large images (>2MB can cause message passing issues)
        if (imageUrl.startsWith('data:') && imageUrl.length > 2 * 1024 * 1024) {
          console.warn('Prometheus content: Image data is very large (>2MB). This may cause message passing issues.');
        }

        // Exit capture mode immediately for better responsiveness
        exitCaptureMode();
        showConfirmation('Image captured! Processing...');

        try {
          // Send the image to the background script which will open a popup window
          chrome.runtime.sendMessage({
            action: 'imageCaptured',
            imageUrl: imageUrl
          }, (response) => {
            if (chrome.runtime.lastError) {
              // If it's a message size error, we should inform the user
              if (chrome.runtime.lastError.message.includes('too large') || chrome.runtime.lastError.message.includes('buffer')) {
                showConfirmation('Image is too large to process. Try a different one.');
              }
            }
          });
        } catch (sendError) {
          // Silent fail - user already sees confirmation
        }
      }
    }
  }

  // ============================================
  // Helper Functions
  // ============================================

  function isValidImage(element) {
    if (!element) return false;

    // Check if it's an img element
    if (element.tagName === 'IMG') {
      const rect = element.getBoundingClientRect();
      // Only consider reasonably sized images
      return rect.width >= 50 && rect.height >= 50;
    }

    // Check for background images
    const computedStyle = window.getComputedStyle(element);
    const bgImage = computedStyle.backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.startsWith('url')) {
      const rect = element.getBoundingClientRect();
      return rect.width >= 50 && rect.height >= 50;
    }

    // Check for picture/source elements
    if (element.tagName === 'PICTURE') {
      return true;
    }

    return false;
  }

  function getImageUrl(element) {
    // Handle img elements
    if (element.tagName === 'IMG') {
      // Prefer srcset for higher resolution
      if (element.srcset) {
        const srcset = element.srcset.split(',');
        // Get the largest image
        const largest = srcset
          .map(s => s.trim().split(' '))
          .sort((a, b) => {
            const widthA = parseInt(a[1]) || 0;
            const widthB = parseInt(b[1]) || 0;
            return widthB - widthA;
          })[0];
        if (largest) return largest[0];
      }
      return element.src;
    }

    // Handle background images
    const computedStyle = window.getComputedStyle(element);
    const bgImage = computedStyle.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match) return match[1];
    }

    // Handle picture elements
    if (element.tagName === 'PICTURE') {
      const img = element.querySelector('img');
      if (img) return getImageUrl(img);
    }

    return null;
  }

  function showConfirmation(message) {
    const confirmation = document.createElement('div');
    confirmation.id = 'prometheus-confirmation';
    confirmation.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(confirmation);

    setTimeout(() => {
      confirmation.classList.add('prometheus-fade-out');
      setTimeout(() => confirmation.remove(), 300);
    }, 2000);
  }

  // ============================================
  // Capture Mode Control
  // ============================================

  function enterCaptureMode() {
    if (captureMode) return;

    captureMode = true;
    document.body.classList.add('prometheus-capture-mode');

    createOverlay();
    createTooltip();

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
  }

  function exitCaptureMode() {
    if (!captureMode) return;

    captureMode = false;
    document.body.classList.remove('prometheus-capture-mode');

    removeUI();

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
  }

  // ============================================
  // Message Listener
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'startCapture':
        enterCaptureMode();
        sendResponse({ success: true });
        break;

      case 'stopCapture':
        exitCaptureMode();
        sendResponse({ success: true });
        break;

      case 'ping':
        sendResponse({ success: true, injected: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  });
})();
