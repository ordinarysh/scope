(function () {
  'use strict';

  // Constants
  const HIGHLIGHT_CLASS = 'scope-element-highlight';
  const OVERLAY_ID = 'scope-overlay-indicator';
  const PADDING_OVERLAY_ID = 'scope-padding-overlay';
  const PADDING_OVERLAY_CLASS = 'scope-padding-overlay-part';
  const EXCLUDED_TAGS = [
    'HTML',
    'BODY',
    'SVG',
    'PATH',
    'G',
    'CIRCLE',
    'RECT',
    'LINE',
    'POLYLINE',
    'POLYGON',
    'USE',
    'SYMBOL',
    'DEFS',
    'MARKER',
    'PATTERN',
    'CLIPPATH',
    'MASK',
  ];

  // State
  let isHighlightingEnabled = false;
  let previousElement = null;
  let eventListenersAttached = false;
  let styleElement = null;
  let overlayElement = null;
  let paddingOverlayContainer = null;
  let paddingOverlayParts = {
    top: null,
    right: null,
    bottom: null,
    left: null,
  };

  // Inject CSS for highlighting and overlay
  function injectCSS() {
    if (styleElement) {
      return; // Already injected
    }

    styleElement = document.createElement('style');
    styleElement.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 2px solid #ff4444 !important;
        outline-offset: 1px !important;
      }

      #${OVERLAY_ID} {
        position: fixed !important;
        top: 10px !important;
        right: 10px !important;
        z-index: 999999 !important;
        background: rgba(0, 0, 0, 0.8) !important;
        color: white !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        padding: 6px 10px !important;
        border-radius: 4px !important;
        border: none !important;
        margin: 0 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
        pointer-events: none !important;
        user-select: none !important;
        display: none !important;
      }

      #${OVERLAY_ID}.visible {
        display: block !important;
      }

      #${PADDING_OVERLAY_ID} {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 999998 !important;
        display: none !important;
      }

      #${PADDING_OVERLAY_ID}.visible {
        display: block !important;
      }

      .${PADDING_OVERLAY_CLASS} {
        position: fixed !important;
        background-color: rgba(76, 175, 80, 0.3) !important;
        pointer-events: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 999997 !important;
      }
    `;
    document.head.appendChild(styleElement);
    console.log('[Scope] CSS injected');
  }

  // Create overlay indicator
  function createOverlay() {
    if (overlayElement) {
      return; // Already created
    }

    overlayElement = document.createElement('div');
    overlayElement.id = OVERLAY_ID;
    overlayElement.textContent = 'SCOPE';
    document.body.appendChild(overlayElement);
    console.log('[Scope] Overlay indicator created');
  }

  // Create padding overlay container and parts
  function createPaddingOverlay() {
    if (paddingOverlayContainer) {
      return; // Already created
    }

    paddingOverlayContainer = document.createElement('div');
    paddingOverlayContainer.id = PADDING_OVERLAY_ID;

    // Create individual padding parts
    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const paddingPart = document.createElement('div');
      paddingPart.className = PADDING_OVERLAY_CLASS;
      paddingPart.setAttribute('data-padding-side', side);
      paddingOverlayContainer.appendChild(paddingPart);
      paddingOverlayParts[side] = paddingPart;
    });

    document.body.appendChild(paddingOverlayContainer);
    console.log('[Scope] Padding overlay created');
  }

  // Show overlay indicator
  function showOverlay() {
    if (overlayElement) {
      overlayElement.classList.add('visible');
      console.log('[Scope] Overlay indicator shown');
    }
  }

  // Hide overlay indicator
  function hideOverlay() {
    if (overlayElement) {
      overlayElement.classList.remove('visible');
      console.log('[Scope] Overlay indicator hidden');
    }
  }

  // Show padding overlay
  function showPaddingOverlay() {
    if (paddingOverlayContainer) {
      paddingOverlayContainer.classList.add('visible');
    }
  }

  // Hide padding overlay
  function hidePaddingOverlay() {
    if (paddingOverlayContainer) {
      paddingOverlayContainer.classList.remove('visible');
    }
  }

  // Remove overlay and CSS
  function cleanup() {
    if (overlayElement && overlayElement.parentNode) {
      overlayElement.parentNode.removeChild(overlayElement);
      overlayElement = null;
    }
    if (paddingOverlayContainer && paddingOverlayContainer.parentNode) {
      paddingOverlayContainer.parentNode.removeChild(paddingOverlayContainer);
      paddingOverlayContainer = null;
      paddingOverlayParts = {
        top: null,
        right: null,
        bottom: null,
        left: null,
      };
    }
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
      styleElement = null;
    }
    console.log('[Scope] Cleaned up overlay and CSS');
  }

  // Get element selector for debugging
  function getElementSelector(element) {
    try {
      if (element.id) {
        return `#${element.id}`;
      }

      // Handle className safely for both HTML and SVG elements
      let className = null;
      if (element.className) {
        // SVG elements have className as SVGAnimatedString, HTML elements as string
        if (typeof element.className === 'string') {
          className = element.className;
        } else if (element.className.baseVal) {
          // SVG element className (SVGAnimatedString)
          className = element.className.baseVal;
        }
      }

      if (className) {
        const classes = className
          .split(' ')
          .filter(c => c && !c.startsWith('scope-'));
        if (classes.length > 0) {
          return `${element.tagName.toLowerCase()}.${classes[0]}`;
        }
      }

      return element.tagName.toLowerCase();
    } catch (error) {
      // Fallback if anything fails
      console.warn('[Scope] Error getting element selector:', error);
      return element.tagName ? element.tagName.toLowerCase() : 'unknown';
    }
  }

  // Safe helper functions for handling classList operations
  function safeAddClass(element, className) {
    try {
      if (element.classList) {
        element.classList.add(className);
      } else {
        // Fallback using setAttribute for elements without classList
        const currentClass = element.getAttribute('class') || '';
        if (!currentClass.includes(className)) {
          element.setAttribute(
            'class',
            currentClass ? `${currentClass} ${className}` : className
          );
        }
      }
    } catch (error) {
      console.warn('[Scope] Error adding class:', error);
    }
  }

  function safeRemoveClass(element, className) {
    try {
      if (element.classList) {
        element.classList.remove(className);
      } else {
        // Fallback using setAttribute for elements without classList
        const currentClass = element.getAttribute('class') || '';
        const newClass = currentClass
          .split(' ')
          .filter(c => c !== className)
          .join(' ');
        element.setAttribute('class', newClass);
      }
    } catch (error) {
      console.warn('[Scope] Error removing class:', error);
    }
  }

  function safeHasClass(element, className) {
    try {
      if (element.classList) {
        return element.classList.contains(className);
      } else {
        // Fallback using getAttribute for elements without classList
        const currentClass = element.getAttribute('class') || '';
        return currentClass.split(' ').includes(className);
      }
    } catch (error) {
      console.warn('[Scope] Error checking class:', error);
      return false;
    }
  }

  function safeGetClassName(element) {
    try {
      if (typeof element.className === 'string') {
        return element.className;
      } else if (element.className && element.className.baseVal) {
        // SVG element className (SVGAnimatedString)
        return element.className.baseVal;
      } else {
        // Fallback to getAttribute
        return element.getAttribute('class') || '';
      }
    } catch (error) {
      console.warn('[Scope] Error getting className:', error);
      return '';
    }
  }

  // Update padding overlay to visualize element's padding
  function updatePaddingOverlay(element) {
    try {
      if (
        !element ||
        !paddingOverlayContainer ||
        !isHighlightingEnabled ||
        EXCLUDED_TAGS.includes(element.tagName)
      ) {
        return;
      }

      // Get element's bounding rectangle and computed styles
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      // Parse padding values
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;

      // Skip if element has no padding
      if (
        paddingTop === 0 &&
        paddingRight === 0 &&
        paddingBottom === 0 &&
        paddingLeft === 0
      ) {
        hidePaddingOverlay();
        return;
      }

      // Use viewport coordinates directly (no scroll offset needed for position: fixed)
      const elementLeft = rect.left;
      const elementTop = rect.top;
      const elementWidth = rect.width;
      const elementHeight = rect.height;

      // Position top padding
      if (paddingTop > 0 && paddingOverlayParts.top) {
        paddingOverlayParts.top.style.left = `${elementLeft}px`;
        paddingOverlayParts.top.style.top = `${elementTop}px`;
        paddingOverlayParts.top.style.width = `${elementWidth}px`;
        paddingOverlayParts.top.style.height = `${paddingTop}px`;
        paddingOverlayParts.top.style.display = 'block';
      } else if (paddingOverlayParts.top) {
        paddingOverlayParts.top.style.display = 'none';
      }

      // Position right padding
      if (paddingRight > 0 && paddingOverlayParts.right) {
        paddingOverlayParts.right.style.left = `${elementLeft + elementWidth - paddingRight}px`;
        paddingOverlayParts.right.style.top = `${elementTop + paddingTop}px`;
        paddingOverlayParts.right.style.width = `${paddingRight}px`;
        paddingOverlayParts.right.style.height = `${elementHeight - paddingTop - paddingBottom}px`;
        paddingOverlayParts.right.style.display = 'block';
      } else if (paddingOverlayParts.right) {
        paddingOverlayParts.right.style.display = 'none';
      }

      // Position bottom padding
      if (paddingBottom > 0 && paddingOverlayParts.bottom) {
        paddingOverlayParts.bottom.style.left = `${elementLeft}px`;
        paddingOverlayParts.bottom.style.top = `${elementTop + elementHeight - paddingBottom}px`;
        paddingOverlayParts.bottom.style.width = `${elementWidth}px`;
        paddingOverlayParts.bottom.style.height = `${paddingBottom}px`;
        paddingOverlayParts.bottom.style.display = 'block';
      } else if (paddingOverlayParts.bottom) {
        paddingOverlayParts.bottom.style.display = 'none';
      }

      // Position left padding
      if (paddingLeft > 0 && paddingOverlayParts.left) {
        paddingOverlayParts.left.style.left = `${elementLeft}px`;
        paddingOverlayParts.left.style.top = `${elementTop + paddingTop}px`;
        paddingOverlayParts.left.style.width = `${paddingLeft}px`;
        paddingOverlayParts.left.style.height = `${elementHeight - paddingTop - paddingBottom}px`;
        paddingOverlayParts.left.style.display = 'block';
      } else if (paddingOverlayParts.left) {
        paddingOverlayParts.left.style.display = 'none';
      }

      // Show the overlay container
      showPaddingOverlay();

      console.log('[Scope] Updated padding overlay for element:', {
        selector: getElementSelector(element),
        padding: {
          top: paddingTop,
          right: paddingRight,
          bottom: paddingBottom,
          left: paddingLeft,
        },
      });
    } catch (error) {
      console.error('[Scope] Error updating padding overlay:', error, element);
      hidePaddingOverlay();
    }
  }

  // Add highlight to element
  function highlightElement(element) {
    try {
      if (
        !element ||
        EXCLUDED_TAGS.includes(element.tagName) ||
        !isHighlightingEnabled
      ) {
        return;
      }

      // Skip if it's one of our overlays
      if (
        element.id === OVERLAY_ID ||
        element.id === PADDING_OVERLAY_ID ||
        element.classList.contains(PADDING_OVERLAY_CLASS)
      ) {
        return;
      }

      // Skip elements without classList (some pseudo-elements or special nodes)
      if (!element.classList) {
        console.warn('[Scope] Element has no classList, skipping:', element);
        return;
      }

      // Remove highlight from previous element
      if (previousElement && previousElement !== element) {
        safeRemoveClass(previousElement, HIGHLIGHT_CLASS);
        console.log(
          '[Scope] Removed highlight from:',
          getElementSelector(previousElement)
        );
      }

      // Add highlight to current element
      if (!safeHasClass(element, HIGHLIGHT_CLASS)) {
        safeAddClass(element, HIGHLIGHT_CLASS);
        console.log('[Scope] Highlighted element:', {
          tag: element.tagName.toLowerCase(),
          selector: getElementSelector(element),
          id: element.id || '(no id)',
          classes: safeGetClassName(element) || '(no classes)',
          text: element.textContent?.substring(0, 50) || '(no text)',
        });
      }

      // Show padding visualization for current element
      updatePaddingOverlay(element);

      previousElement = element;
    } catch (error) {
      console.error('[Scope] Error highlighting element:', error, element);
    }
  }

  // Remove highlight from element
  function removeHighlight(element) {
    try {
      if (!element) return;

      safeRemoveClass(element, HIGHLIGHT_CLASS);
      console.log(
        '[Scope] Removed highlight from:',
        getElementSelector(element)
      );

      // Hide padding overlay
      hidePaddingOverlay();

      if (previousElement === element) {
        previousElement = null;
      }
    } catch (error) {
      console.error('[Scope] Error removing highlight:', error, element);
    }
  }

  // Remove all highlights from the page
  function removeAllHighlights() {
    try {
      const highlightedElements = document.querySelectorAll(
        `.${HIGHLIGHT_CLASS}`
      );
      highlightedElements.forEach(element => {
        safeRemoveClass(element, HIGHLIGHT_CLASS);
      });

      // Hide padding overlay
      hidePaddingOverlay();

      previousElement = null;
      console.log('[Scope] Removed all highlights from page');
    } catch (error) {
      console.error('[Scope] Error removing all highlights:', error);
    }
  }

  // Event handlers
  function handleMouseOver(event) {
    if (!isHighlightingEnabled) return;

    const element = event.target;

    // Skip if already highlighted, excluded, or our overlays
    if (
      element === previousElement ||
      EXCLUDED_TAGS.includes(element.tagName) ||
      element.id === OVERLAY_ID ||
      element.id === PADDING_OVERLAY_ID ||
      element.classList.contains(PADDING_OVERLAY_CLASS)
    ) {
      return;
    }

    highlightElement(element);
  }

  function handleMouseOut(event) {
    if (!isHighlightingEnabled) return;

    const element = event.target;

    // Skip our overlays
    if (
      element.id === OVERLAY_ID ||
      element.id === PADDING_OVERLAY_ID ||
      element.classList.contains(PADDING_OVERLAY_CLASS)
    ) {
      return;
    }

    // Only remove highlight if mouse is leaving to a non-child element
    if (!event.relatedTarget || !element.contains(event.relatedTarget)) {
      removeHighlight(element);
    }
  }

  // Handle click to dismiss highlighting
  function handleClick(event) {
    if (isHighlightingEnabled) {
      // Skip if clicking on our overlays (though they have pointer-events: none)
      if (
        event.target.id === OVERLAY_ID ||
        event.target.id === PADDING_OVERLAY_ID ||
        event.target.classList.contains(PADDING_OVERLAY_CLASS)
      ) {
        return;
      }

      console.log('[Scope] Click detected, disabling highlighting');
      setHighlightingState(false);

      // Notify background script that highlighting was disabled
      try {
        browser.runtime.sendMessage({ action: 'disableHighlighting' });
      } catch (error) {
        console.error('[Scope] Error notifying background script:', error);
      }

      // Don't prevent the default click behavior
    }
  }

  // Attach event listeners
  function attachEventListeners() {
    if (eventListenersAttached) return;

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);

    eventListenersAttached = true;
    console.log('[Scope] Event listeners attached');
  }

  // Remove event listeners
  function removeEventListeners() {
    if (!eventListenersAttached) return;

    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);

    eventListenersAttached = false;
    console.log('[Scope] Event listeners removed');
  }

  // Set highlighting state
  function setHighlightingState(enabled) {
    const wasEnabled = isHighlightingEnabled;
    isHighlightingEnabled = enabled;

    console.log(
      '[Scope] Setting highlighting state from',
      wasEnabled,
      'to',
      enabled
    );

    if (enabled && !wasEnabled) {
      // Enable highlighting
      showOverlay();
      console.log('[Scope] Highlighting enabled');
    } else if (!enabled && wasEnabled) {
      // Disable highlighting
      removeAllHighlights();
      hideOverlay();
      hidePaddingOverlay();
      console.log('[Scope] Highlighting disabled');
    }
  }

  // Handle messages from background script
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[Scope] Received message:', message);

    if (message.action === 'setHighlighting') {
      setHighlightingState(message.enabled);
      sendResponse({ success: true });
    } else if (message.action === 'getState') {
      sendResponse({ enabled: isHighlightingEnabled });
    }

    return true; // Keep message channel open
  });

  // Initialize the extension (dormant by default)
  function init() {
    console.log('[Scope] Content script initialized (dormant)');

    // Set up CSS and overlay (but keep highlighting disabled)
    injectCSS();
    createOverlay();
    createPaddingOverlay();
    attachEventListeners();

    // Start dormant - don't read from storage
    setHighlightingState(false);

    console.log('[Scope] Extension ready (waiting for icon click)');
  }

  // Cleanup on page unload
  function handleBeforeUnload() {
    if (previousElement) {
      removeHighlight(previousElement);
    }
    hidePaddingOverlay();
    removeEventListeners();
    cleanup();
    console.log('[Scope] Cleaned up before page unload');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', handleBeforeUnload);
})();
