(function () {
  'use strict';

  // Constants
  const OVERLAY_ID = 'scope-overlay-indicator';
  const PADDING_OVERLAY_ID = 'scope-padding-overlay';
  const PADDING_OVERLAY_CLASS = 'scope-padding-overlay-part';
  const MARGIN_OVERLAY_ID = 'scope-margin-overlay';
  const MARGIN_OVERLAY_CLASS = 'scope-margin-overlay-part';
  const CONTENT_OVERLAY_ID = 'scope-content-overlay';
  const GAP_OVERLAY_ID = 'scope-gap-overlay';
  const GAP_OVERLAY_CLASS = 'scope-gap-overlay-part';
  const REFERENCE_LINES_ID = 'scope-reference-lines';
  const REFERENCE_LINE_CLASS = 'scope-reference-line';
  const REFERENCE_LINE_THICKNESS = Math.min(0.75, 1 / (window.devicePixelRatio || 1));
  const REFERENCE_LINE_THICKNESS_PX = `${REFERENCE_LINE_THICKNESS}px`;
  const MAX_GAP_CHILDREN = 200;

  // Performance optimization: Debug mode toggle
  const DEBUG_MODE = false; // Set to true only during development

  // Debug logging function
  function debugLog(...args) {
    if (DEBUG_MODE) {
      console.log(...args);
    }
  }

  // DOM update batching system for 60fps performance
  const domUpdateQueue = new Map();
  let rafScheduled = false;

  function batchDOMUpdate(element, updates) {
    if (!domUpdateQueue.has(element)) {
      domUpdateQueue.set(element, {});
    }

    // Merge new updates with existing ones for this element
    Object.assign(domUpdateQueue.get(element), updates);

    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(applyBatchedUpdates);
    }
  }

  function applyBatchedUpdates() {
    for (const [element, updates] of domUpdateQueue) {
      for (const [property, value] of Object.entries(updates)) {
        if (property === 'className') {
          element.className = value;
        } else if (property === 'display') {
          element.style.display = value;
        } else {
          element.style[property] = value;
        }
      }
    }

    domUpdateQueue.clear();
    rafScheduled = false;
  }

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
  let marginOverlayContainer = null;
  let marginOverlayParts = {
    top: null,
    right: null,
    bottom: null,
    left: null,
  };
  let contentOverlayElement = null;
  let gapOverlayContainer = null;
  let gapOverlayParts = [];

  // Reference lines elements
  let referenceLinesContainer = null;
  let referenceLinesElements = {
    top: null,
    bottom: null,
    left: null,
    right: null,
  };

  // Performance optimization: mouseover throttling
  let updateScheduled = false;
  let pendingElement = null;

  // Performance optimization: cached styles
  let cachedStyles = new WeakMap();

  // Get cached computed styles and rect for element
  function getCachedStyles(element) {
    if (!cachedStyles.has(element)) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const marginTop = parseFloat(style.marginTop) || 0;
      const marginRight = parseFloat(style.marginRight) || 0;
      const marginBottom = parseFloat(style.marginBottom) || 0;
      const marginLeft = parseFloat(style.marginLeft) || 0;
      const rowGap = parseFloat(style.rowGap) || 0;
      const columnGap = parseFloat(style.columnGap) || 0;

      cachedStyles.set(element, {
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        padding: {
          top: paddingTop,
          right: paddingRight,
          bottom: paddingBottom,
          left: paddingLeft,
        },
        margin: {
          top: marginTop,
          right: marginRight,
          bottom: marginBottom,
          left: marginLeft,
        },
        layout: {
          display: style.display || '',
          flexDirection: style.flexDirection || '',
          flexWrap: style.flexWrap || '',
          rowGap,
          columnGap,
        },
      });
    }
    return cachedStyles.get(element);
  }

  // Clear cached styles (called on scroll/resize)
  function clearStyleCache() {
    cachedStyles = new WeakMap();
  }

  // Inject CSS for highlighting and overlay
  function injectCSS() {
    if (styleElement) {
      return; // Already injected
    }

    styleElement = document.createElement('style');
    styleElement.textContent = `
      #${REFERENCE_LINES_ID} {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 999999 !important;
        display: none !important;
      }

      #${REFERENCE_LINES_ID}.visible {
        display: block !important;
      }

      .${REFERENCE_LINE_CLASS} {
        position: fixed !important;
        background-color: #ff4444 !important;
        pointer-events: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 999999 !important;
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

      #${MARGIN_OVERLAY_ID} {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 999996 !important;
        display: none !important;
      }

      #${MARGIN_OVERLAY_ID}.visible {
        display: block !important;
      }

      .${MARGIN_OVERLAY_CLASS} {
        position: fixed !important;
        background-color: rgba(246, 178, 107, 0.3) !important;
        pointer-events: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 999995 !important;
      }

      #${CONTENT_OVERLAY_ID} {
        position: fixed !important;
        background-color: rgba(135, 171, 218, 0.3) !important;
        pointer-events: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 999994 !important;
        display: none !important;
      }

      #${CONTENT_OVERLAY_ID}.visible {
        display: block !important;
      }

      #${GAP_OVERLAY_ID} {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 999997 !important;
        display: none !important;
      }

      #${GAP_OVERLAY_ID}.visible {
        display: block !important;
      }

      .${GAP_OVERLAY_CLASS} {
        position: fixed !important;
        pointer-events: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 999996 !important;
        background-color: rgba(189, 47, 255, 0.35) !important;
        background-image: repeating-linear-gradient(
          135deg,
          rgba(189, 47, 255, 0.5) 0px,
          rgba(189, 47, 255, 0.5) 6px,
          rgba(189, 47, 255, 0.2) 6px,
          rgba(189, 47, 255, 0.2) 12px
        ) !important;
      }
    `;
    document.head.appendChild(styleElement);
    debugLog('[Scope] CSS injected');
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
    debugLog('[Scope] Overlay indicator created');
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
    debugLog('[Scope] Padding overlay created');
  }

  // Create margin overlay container and parts
  function createMarginOverlay() {
    if (marginOverlayContainer) {
      return; // Already created
    }

    marginOverlayContainer = document.createElement('div');
    marginOverlayContainer.id = MARGIN_OVERLAY_ID;

    // Create individual margin parts
    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const marginPart = document.createElement('div');
      marginPart.className = MARGIN_OVERLAY_CLASS;
      marginPart.setAttribute('data-margin-side', side);
      marginOverlayContainer.appendChild(marginPart);
      marginOverlayParts[side] = marginPart;
    });

    document.body.appendChild(marginOverlayContainer);
    debugLog('[Scope] Margin overlay created');
  }

  // Create content overlay element
  function createContentOverlay() {
    if (contentOverlayElement) {
      return; // Already created
    }

    contentOverlayElement = document.createElement('div');
    contentOverlayElement.id = CONTENT_OVERLAY_ID;

    document.body.appendChild(contentOverlayElement);
    debugLog('[Scope] Content overlay created');
  }

  // Create gap overlay container
  function createGapOverlay() {
    if (gapOverlayContainer) {
      return; // Already created
    }

    gapOverlayContainer = document.createElement('div');
    gapOverlayContainer.id = GAP_OVERLAY_ID;
    document.body.appendChild(gapOverlayContainer);
    gapOverlayParts = [];
    debugLog('[Scope] Gap overlay created');
  }

  // Create reference lines container and elements
  function createReferenceLines() {
    if (referenceLinesContainer) {
      return; // Already created
    }

    // Create container
    referenceLinesContainer = document.createElement('div');
    referenceLinesContainer.id = REFERENCE_LINES_ID;

    // Create individual line elements
    ['top', 'bottom', 'left', 'right'].forEach(side => {
      const line = document.createElement('div');
      line.className = REFERENCE_LINE_CLASS;
      line.setAttribute('data-line-side', side);
      referenceLinesContainer.appendChild(line);
      referenceLinesElements[side] = line;
    });

    document.body.appendChild(referenceLinesContainer);
    debugLog('[Scope] Reference lines created');
  }

  // Show overlay indicator
  function showOverlay() {
    if (overlayElement) {
      overlayElement.classList.add('visible');
      debugLog('[Scope] Overlay indicator shown');
    }
  }

  // Hide overlay indicator
  function hideOverlay() {
    if (overlayElement) {
      overlayElement.classList.remove('visible');
      debugLog('[Scope] Overlay indicator hidden');
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

  // Show margin overlay
  function showMarginOverlay() {
    if (marginOverlayContainer) {
      marginOverlayContainer.classList.add('visible');
    }
  }

  // Hide margin overlay
  function hideMarginOverlay() {
    if (marginOverlayContainer) {
      marginOverlayContainer.classList.remove('visible');
    }
  }

  // Show content overlay
  function showContentOverlay() {
    if (contentOverlayElement) {
      contentOverlayElement.classList.add('visible');
    }
  }

  // Hide content overlay
  function hideContentOverlay() {
    if (contentOverlayElement) {
      contentOverlayElement.classList.remove('visible');
    }
  }

  // Show gap overlay container
  function showGapOverlay() {
    if (gapOverlayContainer) {
      gapOverlayContainer.classList.add('visible');
    }
  }

  // Hide gap overlay and any rendered parts
  function hideGapOverlay() {
    if (gapOverlayContainer) {
      gapOverlayContainer.classList.remove('visible');
    }
    for (const part of gapOverlayParts) {
      if (part) {
        batchDOMUpdate(part, { display: 'none' });
      }
    }
  }

  // Show reference lines
  function showReferenceLines() {
    if (referenceLinesContainer) {
      referenceLinesContainer.classList.add('visible');
    }
  }

  // Hide reference lines
  function hideReferenceLines() {
    if (referenceLinesContainer) {
      referenceLinesContainer.classList.remove('visible');
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
    if (marginOverlayContainer && marginOverlayContainer.parentNode) {
      marginOverlayContainer.parentNode.removeChild(marginOverlayContainer);
      marginOverlayContainer = null;
      marginOverlayParts = {
        top: null,
        right: null,
        bottom: null,
        left: null,
      };
    }
    if (gapOverlayContainer && gapOverlayContainer.parentNode) {
      gapOverlayContainer.parentNode.removeChild(gapOverlayContainer);
      gapOverlayContainer = null;
      gapOverlayParts = [];
    }
    if (contentOverlayElement && contentOverlayElement.parentNode) {
      contentOverlayElement.parentNode.removeChild(contentOverlayElement);
      contentOverlayElement = null;
    }
    if (referenceLinesContainer && referenceLinesContainer.parentNode) {
      referenceLinesContainer.parentNode.removeChild(referenceLinesContainer);
      referenceLinesContainer = null;
      referenceLinesElements = {
        top: null,
        bottom: null,
        left: null,
        right: null,
      };
    }
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
      styleElement = null;
    }
    debugLog('[Scope] Cleaned up overlay and CSS');
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

  // Update reference lines to show Safari-style element boundaries
  function updateReferenceLines(element) {
    try {
      if (
        !element ||
        !referenceLinesContainer ||
        !isHighlightingEnabled ||
        EXCLUDED_TAGS.includes(element.tagName)
      ) {
        return;
      }

      // Get cached element styles and rect for performance
      const cached = getCachedStyles(element);
      const { rect } = cached;

      // Position top line (horizontal, extends full viewport width)
      if (referenceLinesElements.top) {
        batchDOMUpdate(referenceLinesElements.top, {
          left: '0px',
          top: `${rect.top}px`,
          width: '100vw',
          height: REFERENCE_LINE_THICKNESS_PX,
        });
      }

      // Position bottom line (horizontal, extends full viewport width)
      if (referenceLinesElements.bottom) {
        batchDOMUpdate(referenceLinesElements.bottom, {
          left: '0px',
          top: `${rect.top + rect.height}px`,
          width: '100vw',
          height: REFERENCE_LINE_THICKNESS_PX,
        });
      }

      // Position left line (vertical, extends full viewport height)
      if (referenceLinesElements.left) {
        batchDOMUpdate(referenceLinesElements.left, {
          left: `${rect.left}px`,
          top: '0px',
          width: REFERENCE_LINE_THICKNESS_PX,
          height: '100vh',
        });
      }

      // Position right line (vertical, extends full viewport height)
      if (referenceLinesElements.right) {
        batchDOMUpdate(referenceLinesElements.right, {
          left: `${rect.left + rect.width}px`,
          top: '0px',
          width: REFERENCE_LINE_THICKNESS_PX,
          height: '100vh',
        });
      }

      // Show the reference lines container
      showReferenceLines();

      debugLog('[Scope] Updated reference lines for element:', {
        selector: getElementSelector(element),
        bounds: {
          top: rect.top,
          bottom: rect.top + rect.height,
          left: rect.left,
          right: rect.left + rect.width,
        },
      });
    } catch (error) {
      console.error('[Scope] Error updating reference lines:', error);
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

      // Get cached element styles and rect for performance
      const cached = getCachedStyles(element);
      const { rect, padding } = cached;
      const {
        top: paddingTop,
        right: paddingRight,
        bottom: paddingBottom,
        left: paddingLeft,
      } = padding;

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
        batchDOMUpdate(paddingOverlayParts.top, {
          left: `${elementLeft}px`,
          top: `${elementTop}px`,
          width: `${elementWidth}px`,
          height: `${paddingTop}px`,
          display: 'block',
        });
      } else if (paddingOverlayParts.top) {
        batchDOMUpdate(paddingOverlayParts.top, { display: 'none' });
      }

      // Position right padding
      if (paddingRight > 0 && paddingOverlayParts.right) {
        batchDOMUpdate(paddingOverlayParts.right, {
          left: `${elementLeft + elementWidth - paddingRight}px`,
          top: `${elementTop + paddingTop}px`,
          width: `${paddingRight}px`,
          height: `${elementHeight - paddingTop - paddingBottom}px`,
          display: 'block',
        });
      } else if (paddingOverlayParts.right) {
        batchDOMUpdate(paddingOverlayParts.right, { display: 'none' });
      }

      // Position bottom padding
      if (paddingBottom > 0 && paddingOverlayParts.bottom) {
        batchDOMUpdate(paddingOverlayParts.bottom, {
          left: `${elementLeft}px`,
          top: `${elementTop + elementHeight - paddingBottom}px`,
          width: `${elementWidth}px`,
          height: `${paddingBottom}px`,
          display: 'block',
        });
      } else if (paddingOverlayParts.bottom) {
        batchDOMUpdate(paddingOverlayParts.bottom, { display: 'none' });
      }

      // Position left padding
      if (paddingLeft > 0 && paddingOverlayParts.left) {
        batchDOMUpdate(paddingOverlayParts.left, {
          left: `${elementLeft}px`,
          top: `${elementTop + paddingTop}px`,
          width: `${paddingLeft}px`,
          height: `${elementHeight - paddingTop - paddingBottom}px`,
          display: 'block',
        });
      } else if (paddingOverlayParts.left) {
        batchDOMUpdate(paddingOverlayParts.left, { display: 'none' });
      }

      // Show the overlay container
      showPaddingOverlay();

      debugLog('[Scope] Updated padding overlay for element:', {
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

  // Update margin overlay positioning for element
  function updateMarginOverlay(element) {
    try {
      if (
        !element ||
        !marginOverlayContainer ||
        !isHighlightingEnabled ||
        EXCLUDED_TAGS.includes(element.tagName)
      ) {
        return;
      }

      // Get cached element styles and rect for performance
      const cached = getCachedStyles(element);
      const { rect, margin } = cached;
      const {
        top: marginTop,
        right: marginRight,
        bottom: marginBottom,
        left: marginLeft,
      } = margin;

      // Skip if element has no margin
      if (
        marginTop === 0 &&
        marginRight === 0 &&
        marginBottom === 0 &&
        marginLeft === 0
      ) {
        hideMarginOverlay();
        return;
      }

      // Use viewport coordinates directly (no scroll offset needed for position: fixed)
      const elementLeft = rect.left;
      const elementTop = rect.top;
      const elementWidth = rect.width;
      const elementHeight = rect.height;

      // Position top margin (above element)
      if (marginTop > 0 && marginOverlayParts.top) {
        batchDOMUpdate(marginOverlayParts.top, {
          left: `${elementLeft - marginLeft}px`,
          top: `${elementTop - marginTop}px`,
          width: `${elementWidth + marginLeft + marginRight}px`,
          height: `${marginTop}px`,
          display: 'block',
        });
      } else if (marginOverlayParts.top) {
        batchDOMUpdate(marginOverlayParts.top, { display: 'none' });
      }

      // Position right margin (to the right of element)
      if (marginRight > 0 && marginOverlayParts.right) {
        batchDOMUpdate(marginOverlayParts.right, {
          left: `${elementLeft + elementWidth}px`,
          top: `${elementTop}px`,
          width: `${marginRight}px`,
          height: `${elementHeight}px`,
          display: 'block',
        });
      } else if (marginOverlayParts.right) {
        batchDOMUpdate(marginOverlayParts.right, { display: 'none' });
      }

      // Position bottom margin (below element)
      if (marginBottom > 0 && marginOverlayParts.bottom) {
        batchDOMUpdate(marginOverlayParts.bottom, {
          left: `${elementLeft - marginLeft}px`,
          top: `${elementTop + elementHeight}px`,
          width: `${elementWidth + marginLeft + marginRight}px`,
          height: `${marginBottom}px`,
          display: 'block',
        });
      } else if (marginOverlayParts.bottom) {
        batchDOMUpdate(marginOverlayParts.bottom, { display: 'none' });
      }

      // Position left margin (to the left of element)
      if (marginLeft > 0 && marginOverlayParts.left) {
        batchDOMUpdate(marginOverlayParts.left, {
          left: `${elementLeft - marginLeft}px`,
          top: `${elementTop}px`,
          width: `${marginLeft}px`,
          height: `${elementHeight}px`,
          display: 'block',
        });
      } else if (marginOverlayParts.left) {
        batchDOMUpdate(marginOverlayParts.left, { display: 'none' });
      }

      // Show the overlay container
      showMarginOverlay();

      debugLog('[Scope] Updated margin overlay for element:', {
        selector: getElementSelector(element),
        margin: {
          top: marginTop,
          right: marginRight,
          bottom: marginBottom,
          left: marginLeft,
        },
      });
    } catch (error) {
      console.error('[Scope] Error updating margin overlay:', error, element);
      hideMarginOverlay();
    }
  }

  // Update content overlay positioning for element
  function updateContentOverlay(element) {
    try {
      if (
        !element ||
        !contentOverlayElement ||
        !isHighlightingEnabled ||
        EXCLUDED_TAGS.includes(element.tagName)
      ) {
        return;
      }

      // Get cached element styles and rect for performance
      const cached = getCachedStyles(element);
      const { rect, padding } = cached;
      const {
        top: paddingTop,
        right: paddingRight,
        bottom: paddingBottom,
        left: paddingLeft,
      } = padding;

      // Calculate content area (inside padding)
      const contentLeft = rect.left + paddingLeft;
      const contentTop = rect.top + paddingTop;
      const contentWidth = rect.width - paddingLeft - paddingRight;
      const contentHeight = rect.height - paddingTop - paddingBottom;

      // Skip if content area has no dimensions
      if (contentWidth <= 0 || contentHeight <= 0) {
        hideContentOverlay();
        return;
      }

      // Position content overlay
      batchDOMUpdate(contentOverlayElement, {
        left: `${contentLeft}px`,
        top: `${contentTop}px`,
        width: `${contentWidth}px`,
        height: `${contentHeight}px`,
      });

      // Show the overlay
      showContentOverlay();

      debugLog('[Scope] Updated content overlay for element:', {
        selector: getElementSelector(element),
        content: {
          left: contentLeft,
          top: contentTop,
          width: contentWidth,
          height: contentHeight,
        },
      });
    } catch (error) {
      console.error('[Scope] Error updating content overlay:', error, element);
      hideContentOverlay();
    }
  }

  function ensureGapOverlayParts(count) {
    if (!gapOverlayContainer) {
      return;
    }

    while (gapOverlayParts.length < count) {
      const part = document.createElement('div');
      part.className = GAP_OVERLAY_CLASS;
      gapOverlayContainer.appendChild(part);
      gapOverlayParts.push(part);
    }
  }

  function computeGapRectangles(element, containerRect, layout) {
    const results = [];

    if (!element || !containerRect || !layout) {
      return results;
    }

    const { rowGap = 0, columnGap = 0 } = layout;
    const hasRowGap = rowGap > 0;
    const hasColumnGap = columnGap > 0;

    if (!hasRowGap && !hasColumnGap) {
      return results;
    }

    const childCount = element.children.length;
    if (childCount < 2 || childCount > MAX_GAP_CHILDREN) {
      return results;
    }

    const childRects = [];
    for (const child of element.children) {
      if (!(child instanceof Element)) {
        continue;
      }

      if (
        child.id === OVERLAY_ID ||
        child.id === PADDING_OVERLAY_ID ||
        child.id === MARGIN_OVERLAY_ID ||
        child.id === CONTENT_OVERLAY_ID ||
        child.id === GAP_OVERLAY_ID ||
        child.id === REFERENCE_LINES_ID ||
        child.classList.contains(PADDING_OVERLAY_CLASS) ||
        child.classList.contains(MARGIN_OVERLAY_CLASS) ||
        child.classList.contains(GAP_OVERLAY_CLASS) ||
        child.classList.contains(REFERENCE_LINE_CLASS)
      ) {
        continue;
      }

      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      childRects.push(rect);
    }

    if (childRects.length < 2) {
      return results;
    }

    const containerRight = containerRect.left + containerRect.width;
    const containerBottom = containerRect.top + containerRect.height;
    const EPSILON = 0.5;

    if (hasColumnGap) {
      const sortedByX = childRects.slice().sort((a, b) => a.left - b.left);

      for (let index = 1; index < sortedByX.length; index += 1) {
        const prevRect = sortedByX[index - 1];
        const currRect = sortedByX[index];
        const spaceWidth = currRect.left - prevRect.right;

        if (spaceWidth <= EPSILON) {
          continue;
        }

        const overlapTop = Math.max(prevRect.top, currRect.top);
        const overlapBottom = Math.min(prevRect.bottom, currRect.bottom);
        const verticalOverlap = overlapBottom - overlapTop;

        if (verticalOverlap <= EPSILON) {
          continue;
        }

        const targetWidth = Math.min(columnGap, spaceWidth);
        const centeredLeft = prevRect.right + Math.max((spaceWidth - targetWidth) / 2, 0);
        const left = Math.max(containerRect.left, centeredLeft);
        const right = Math.min(containerRight, centeredLeft + targetWidth);
        const width = right - left;

        if (width <= EPSILON) {
          continue;
        }

        const top = Math.max(containerRect.top, overlapTop);
        const bottom = Math.min(containerBottom, overlapBottom);
        const height = bottom - top;

        if (height <= EPSILON) {
          continue;
        }

        results.push({ left, top, width, height });
      }
    }

    if (hasRowGap) {
      const sortedByY = childRects.slice().sort((a, b) => a.top - b.top);

      for (let index = 1; index < sortedByY.length; index += 1) {
        const prevRect = sortedByY[index - 1];
        const currRect = sortedByY[index];
        const spaceHeight = currRect.top - prevRect.bottom;

        if (spaceHeight <= EPSILON) {
          continue;
        }

        const overlapLeft = Math.max(prevRect.left, currRect.left);
        const overlapRight = Math.min(prevRect.right, currRect.right);
        const horizontalOverlap = overlapRight - overlapLeft;

        if (horizontalOverlap <= EPSILON) {
          continue;
        }

        const targetHeight = Math.min(rowGap, spaceHeight);
        const centeredTop = prevRect.bottom + Math.max((spaceHeight - targetHeight) / 2, 0);
        const top = Math.max(containerRect.top, centeredTop);
        const bottom = Math.min(containerBottom, centeredTop + targetHeight);
        const height = bottom - top;

        if (height <= EPSILON) {
          continue;
        }

        const left = Math.max(containerRect.left, overlapLeft);
        const right = Math.min(containerRight, overlapRight);
        const width = right - left;

        if (width <= EPSILON) {
          continue;
        }

        results.push({ left, top, width, height });
      }
    }

    return results;
  }

  function updateGapOverlay(element) {
    try {
      if (
        !element ||
        !gapOverlayContainer ||
        !isHighlightingEnabled ||
        EXCLUDED_TAGS.includes(element.tagName)
      ) {
        return;
      }

      const cached = getCachedStyles(element);
      const { rect, layout } = cached;

      if (!layout) {
        hideGapOverlay();
        return;
      }

      const { display = '', rowGap = 0, columnGap = 0 } = layout;
      const supportsGapHighlight =
        display.includes('grid') || display.includes('flex');

      if (!supportsGapHighlight || (rowGap <= 0 && columnGap <= 0)) {
        hideGapOverlay();
        return;
      }

      const gapRects = computeGapRectangles(element, rect, layout);

      if (gapRects.length === 0) {
        hideGapOverlay();
        return;
      }

      ensureGapOverlayParts(gapRects.length);

      gapRects.forEach((gapRect, index) => {
        const part = gapOverlayParts[index];
        if (!part) {
          return;
        }

        batchDOMUpdate(part, {
          left: `${gapRect.left}px`,
          top: `${gapRect.top}px`,
          width: `${gapRect.width}px`,
          height: `${gapRect.height}px`,
          display: 'block',
        });
      });

      for (let index = gapRects.length; index < gapOverlayParts.length; index += 1) {
        const part = gapOverlayParts[index];
        if (part) {
          batchDOMUpdate(part, { display: 'none' });
        }
      }

      showGapOverlay();

      debugLog('[Scope] Updated gap overlay for element:', {
        selector: getElementSelector(element),
        gapRects,
      });
    } catch (error) {
      console.error('[Scope] Error updating gap overlay:', error, element);
      hideGapOverlay();
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
        element.id === GAP_OVERLAY_ID ||
        element.id === REFERENCE_LINES_ID ||
        element.classList.contains(PADDING_OVERLAY_CLASS) ||
        element.classList.contains(GAP_OVERLAY_CLASS) ||
        element.classList.contains(REFERENCE_LINE_CLASS)
      ) {
        return;
      }

      // Skip elements without classList (some pseudo-elements or special nodes)
      if (!element.classList) {
        console.warn('[Scope] Element has no classList, skipping:', element);
        return;
      }

      // Create reference lines if not already created
      createReferenceLines();

      // Log element being highlighted
      debugLog('[Scope] Highlighted element:', {
        tag: element.tagName.toLowerCase(),
        selector: getElementSelector(element),
        id: element.id || '(no id)',
        classes: safeGetClassName(element) || '(no classes)',
        text: element.textContent?.substring(0, 50) || '(no text)',
      });

      // Show reference lines for current element
      updateReferenceLines(element);

      // Show padding visualization for current element
      updatePaddingOverlay(element);

      // Show margin visualization for current element
      updateMarginOverlay(element);

      // Show content visualization for current element
      updateContentOverlay(element);

      // Show gap visualization for current element
      updateGapOverlay(element);

      previousElement = element;
    } catch (error) {
      console.error('[Scope] Error highlighting element:', error, element);
    }
  }

  // Remove highlight from element
  function removeHighlight(element) {
    try {
      if (!element) return;

      debugLog('[Scope] Removed highlight from:', getElementSelector(element));

      // Hide reference lines
      hideReferenceLines();

      // Hide padding overlay
      hidePaddingOverlay();

      // Hide margin overlay
      hideMarginOverlay();

      // Hide content overlay
      hideContentOverlay();

      // Hide gap overlay
      hideGapOverlay();

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
      // Hide reference lines
      hideReferenceLines();

      // Hide padding overlay
      hidePaddingOverlay();

      // Hide margin overlay
      hideMarginOverlay();

      // Hide content overlay
      hideContentOverlay();

      // Hide gap overlay
      hideGapOverlay();

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
      element.id === GAP_OVERLAY_ID ||
      element.classList.contains(PADDING_OVERLAY_CLASS) ||
      element.classList.contains(GAP_OVERLAY_CLASS)
    ) {
      return;
    }

    // Performance optimization: throttle highlighting with requestAnimationFrame
    pendingElement = element;

    if (!updateScheduled) {
      updateScheduled = true;
      requestAnimationFrame(() => {
        if (pendingElement && isHighlightingEnabled) {
          highlightElement(pendingElement);
        }
        updateScheduled = false;
      });
    }
  }

  function handleMouseOut(event) {
    if (!isHighlightingEnabled) return;

    const element = event.target;

    // Skip our overlays
    if (
      element.id === OVERLAY_ID ||
      element.id === PADDING_OVERLAY_ID ||
      element.id === GAP_OVERLAY_ID ||
      element.classList.contains(PADDING_OVERLAY_CLASS) ||
      element.classList.contains(GAP_OVERLAY_CLASS)
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
        event.target.id === GAP_OVERLAY_ID ||
        event.target.classList.contains(PADDING_OVERLAY_CLASS) ||
        event.target.classList.contains(GAP_OVERLAY_CLASS)
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

  // Handle scroll to update overlay positions
  function handleScroll() {
    if (!isHighlightingEnabled || !previousElement) {
      return;
    }

    // Clear cached styles since element positions have changed
    clearStyleCache();

    // Update all overlay positions for the current element
    updateReferenceLines(previousElement);
    updatePaddingOverlay(previousElement);
    updateMarginOverlay(previousElement);
    updateContentOverlay(previousElement);
    updateGapOverlay(previousElement);
  }

  // Handle resize to invalidate cached styles
  function handleResize() {
    if (!isHighlightingEnabled) {
      return;
    }

    // Clear cached styles since element positions may have changed
    clearStyleCache();

    // Update overlays if there's an active element
    if (previousElement) {
      updateReferenceLines(previousElement);
      updatePaddingOverlay(previousElement);
      updateMarginOverlay(previousElement);
      updateContentOverlay(previousElement);
      updateGapOverlay(previousElement);
    }
  }

  // Attach event listeners
  function attachEventListeners() {
    if (eventListenersAttached) return;

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize, true);

    eventListenersAttached = true;
    console.log('[Scope] Event listeners attached');
  }

  // Remove event listeners
  function removeEventListeners() {
    if (!eventListenersAttached) return;

    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleResize, true);

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
      hideMarginOverlay();
      hideContentOverlay();
      hideGapOverlay();
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
    createMarginOverlay();
    createContentOverlay();
    createGapOverlay();
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
    hideMarginOverlay();
    hideContentOverlay();
    hideGapOverlay();
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
