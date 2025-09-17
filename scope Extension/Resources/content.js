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
  const ENABLE_REFERENCE_LINES = false;
  const REFERENCE_LINE_THICKNESS = Math.min(
    0.75,
    1 / (window.devicePixelRatio || 1)
  );
  const REFERENCE_LINE_THICKNESS_PX = `${REFERENCE_LINE_THICKNESS}px`;
  const MAX_GAP_CHILDREN = 200;
  const COLOR_PADDING = 'rgba(110, 228, 140, 0.4)';
  const COLOR_MARGIN = 'rgba(255, 186, 86, 0.4)';
  const COLOR_CONTENT = 'rgba(138, 196, 255, 0.35)';
  const COLOR_GAP_SOLID = 'rgba(194, 84, 255, 0.4)';
  const COLOR_GAP_STRIPE_DARK = 'rgba(194, 84, 255, 0.55)';
  const COLOR_GAP_STRIPE_LIGHT = 'rgba(194, 84, 255, 0.25)';
  const GAP_ALIGNMENT_THRESHOLD = 2;
  const GAP_EPSILON = 0.5;

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

  function ensureReferenceLinesRoot() {
    if (!ENABLE_REFERENCE_LINES) {
      return null;
    }

    if (referenceLinesRoot) {
      return referenceLinesRoot;
    }

    referenceLinesHost = document.createElement('div');
    referenceLinesHost.id = `${REFERENCE_LINES_ID}-host`;
    referenceLinesHost.setAttribute('aria-hidden', 'true');
    referenceLinesHost.style.setProperty('position', 'fixed', 'important');
    referenceLinesHost.style.setProperty('inset', '0', 'important');
    referenceLinesHost.style.setProperty('width', '100vw', 'important');
    referenceLinesHost.style.setProperty('height', '100vh', 'important');
    referenceLinesHost.style.setProperty('pointer-events', 'none', 'important');
    referenceLinesHost.style.setProperty('z-index', '2147483646', 'important');
    referenceLinesHost.style.setProperty(
      'contain',
      'layout style paint',
      'important'
    );
    referenceLinesHost.style.setProperty('transform', 'none', 'important');

    const root = referenceLinesHost.attachShadow
      ? referenceLinesHost.attachShadow({ mode: 'open' })
      : referenceLinesHost;

    if (root !== referenceLinesHost) {
      const shadowStyle = document.createElement('style');
      shadowStyle.textContent = `
        :host {
          position: fixed;
          inset: 0;
          pointer-events: none;
          display: block;
          z-index: 2147483646;
        }

        #${REFERENCE_LINES_ID} {
          position: fixed;
          pointer-events: none;
          display: none;
          inset: 0;
        }

        #${REFERENCE_LINES_ID}.visible {
          display: block;
        }

        .${REFERENCE_LINE_CLASS} {
          position: fixed;
          background-color: #ff4444;
          pointer-events: none;
          border: none;
          margin: 0;
          padding: 0;
        }
      `;

      root.appendChild(shadowStyle);
    }

    const hostParent = document.documentElement || document.body || document;
    hostParent.appendChild(referenceLinesHost);
    referenceLinesRoot = root;
    return referenceLinesRoot;
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

  // Reference lines elements - L-corner segments
  let referenceLinesHost = null;
  let referenceLinesRoot = null;
  let referenceLinesContainer = null;
  let referenceLinesElements = {
    topLeftHorizontal: null, // From viewport left edge TO element left
    topLeftVertical: null, // From viewport top edge TO element top
    topRightHorizontal: null, // From element right TO viewport right edge
    topRightVertical: null, // From viewport top edge TO element top
    bottomLeftHorizontal: null, // From viewport left edge TO element left
    bottomLeftVertical: null, // From element bottom TO viewport bottom edge
    bottomRightHorizontal: null, // From element right TO viewport right edge
    bottomRightVertical: null, // From element bottom TO viewport bottom edge
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
    const referenceLinesCSS = ENABLE_REFERENCE_LINES
      ? `
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
    `
      : '';

    styleElement.textContent = `
      ${referenceLinesCSS}

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
        background-color: ${COLOR_PADDING} !important;
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
        background-color: ${COLOR_MARGIN} !important;
        pointer-events: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 999995 !important;
      }

      #${CONTENT_OVERLAY_ID} {
        position: fixed !important;
        background-color: ${COLOR_CONTENT} !important;
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
        background-color: ${COLOR_GAP_SOLID} !important;
        background-image: repeating-linear-gradient(
          135deg,
          ${COLOR_GAP_STRIPE_DARK} 0px,
          ${COLOR_GAP_STRIPE_DARK} 6px,
          ${COLOR_GAP_STRIPE_LIGHT} 6px,
          ${COLOR_GAP_STRIPE_LIGHT} 12px
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
    if (!ENABLE_REFERENCE_LINES) {
      return;
    }

    if (referenceLinesContainer) {
      return; // Already created
    }

    const root = ensureReferenceLinesRoot();
    if (!root) {
      return;
    }

    // Create container
    referenceLinesContainer = document.createElement('div');
    referenceLinesContainer.id = REFERENCE_LINES_ID;

    // Create L-corner line segments
    const cornerSegments = [
      'topLeftHorizontal',
      'topLeftVertical',
      'topRightHorizontal',
      'topRightVertical',
      'bottomLeftHorizontal',
      'bottomLeftVertical',
      'bottomRightHorizontal',
      'bottomRightVertical',
    ];

    cornerSegments.forEach(segmentName => {
      const line = document.createElement('div');
      line.className = REFERENCE_LINE_CLASS;
      line.setAttribute('data-corner-segment', segmentName);
      referenceLinesContainer.appendChild(line);
      referenceLinesElements[segmentName] = line;
    });

    root.appendChild(referenceLinesContainer);
    debugLog('[Scope] L-corner reference lines created');
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
    if (!ENABLE_REFERENCE_LINES || !referenceLinesContainer) {
      return;
    }

    referenceLinesContainer.classList.add('visible');
  }

  // Hide reference lines
  function hideReferenceLines() {
    if (!referenceLinesContainer) {
      return;
    }

    referenceLinesContainer.classList.remove('visible');
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
    }
    if (referenceLinesHost && referenceLinesHost.parentNode) {
      referenceLinesHost.parentNode.removeChild(referenceLinesHost);
    }
    referenceLinesContainer = null;
    referenceLinesRoot = null;
    referenceLinesHost = null;
    referenceLinesElements = {
      topLeftHorizontal: null,
      topLeftVertical: null,
      topRightHorizontal: null,
      topRightVertical: null,
      bottomLeftHorizontal: null,
      bottomLeftVertical: null,
      bottomRightHorizontal: null,
      bottomRightVertical: null,
    };
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

  // Update reference lines to show L-corner indicators extending to viewport edges
  function updateReferenceLines(element) {
    try {
      if (!ENABLE_REFERENCE_LINES) {
        return;
      }

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

      // Calculate element corner positions
      const elementLeft = rect.left;
      const elementTop = rect.top;
      const elementRight = rect.left + rect.width;
      const elementBottom = rect.top + rect.height;

      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Top-Left Corner L
      // Horizontal line: from viewport left edge TO element left edge
      if (referenceLinesElements.topLeftHorizontal) {
        const lineWidth = Math.max(0, elementLeft);
        const isVisible =
          elementTop >= -REFERENCE_LINE_THICKNESS &&
          elementTop <= viewportHeight &&
          lineWidth >= 0;

        batchDOMUpdate(referenceLinesElements.topLeftHorizontal, {
          left: '0px',
          top: `${elementTop}px`,
          width: `${lineWidth}px`,
          height: REFERENCE_LINE_THICKNESS_PX,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Vertical line: from viewport top edge TO element top edge
      if (referenceLinesElements.topLeftVertical) {
        const lineHeight = Math.max(0, elementTop);
        const isVisible =
          elementLeft >= -REFERENCE_LINE_THICKNESS &&
          elementLeft <= viewportWidth &&
          lineHeight >= 0;

        batchDOMUpdate(referenceLinesElements.topLeftVertical, {
          left: `${elementLeft}px`,
          top: '0px',
          width: REFERENCE_LINE_THICKNESS_PX,
          height: `${lineHeight}px`,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Top-Right Corner L
      // Horizontal line: from element right edge TO viewport right edge
      if (referenceLinesElements.topRightHorizontal) {
        const lineWidth = Math.max(0, viewportWidth - elementRight);
        const isVisible =
          elementTop >= -REFERENCE_LINE_THICKNESS &&
          elementTop <= viewportHeight &&
          elementRight <= viewportWidth + REFERENCE_LINE_THICKNESS &&
          lineWidth >= 0;

        batchDOMUpdate(referenceLinesElements.topRightHorizontal, {
          left: `${elementRight}px`,
          top: `${elementTop}px`,
          width: `${lineWidth}px`,
          height: REFERENCE_LINE_THICKNESS_PX,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Vertical line: from viewport top edge TO element top edge
      if (referenceLinesElements.topRightVertical) {
        const lineHeight = Math.max(0, elementTop);
        const isVisible =
          elementRight >= -REFERENCE_LINE_THICKNESS &&
          elementRight <= viewportWidth + REFERENCE_LINE_THICKNESS &&
          lineHeight >= 0;

        batchDOMUpdate(referenceLinesElements.topRightVertical, {
          left: `${elementRight}px`,
          top: '0px',
          width: REFERENCE_LINE_THICKNESS_PX,
          height: `${lineHeight}px`,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Bottom-Left Corner L
      // Horizontal line: from viewport left edge TO element left edge
      if (referenceLinesElements.bottomLeftHorizontal) {
        const lineWidth = Math.max(0, elementLeft);
        const isVisible =
          elementBottom >= -REFERENCE_LINE_THICKNESS &&
          elementBottom <= viewportHeight + REFERENCE_LINE_THICKNESS &&
          lineWidth >= 0;

        batchDOMUpdate(referenceLinesElements.bottomLeftHorizontal, {
          left: '0px',
          top: `${elementBottom}px`,
          width: `${lineWidth}px`,
          height: REFERENCE_LINE_THICKNESS_PX,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Vertical line: from element bottom edge TO viewport bottom edge
      if (referenceLinesElements.bottomLeftVertical) {
        const lineHeight = Math.max(0, viewportHeight - elementBottom);
        const isVisible =
          elementLeft >= -REFERENCE_LINE_THICKNESS &&
          elementLeft <= viewportWidth &&
          elementBottom <= viewportHeight + REFERENCE_LINE_THICKNESS &&
          lineHeight >= 0;

        batchDOMUpdate(referenceLinesElements.bottomLeftVertical, {
          left: `${elementLeft}px`,
          top: `${elementBottom}px`,
          width: REFERENCE_LINE_THICKNESS_PX,
          height: `${lineHeight}px`,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Bottom-Right Corner L
      // Horizontal line: from element right edge TO viewport right edge
      if (referenceLinesElements.bottomRightHorizontal) {
        const lineWidth = Math.max(0, viewportWidth - elementRight);
        const isVisible =
          elementBottom >= -REFERENCE_LINE_THICKNESS &&
          elementBottom <= viewportHeight + REFERENCE_LINE_THICKNESS &&
          elementRight <= viewportWidth + REFERENCE_LINE_THICKNESS &&
          lineWidth >= 0;

        batchDOMUpdate(referenceLinesElements.bottomRightHorizontal, {
          left: `${elementRight}px`,
          top: `${elementBottom}px`,
          width: `${lineWidth}px`,
          height: REFERENCE_LINE_THICKNESS_PX,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Vertical line: from element bottom edge TO viewport bottom edge
      if (referenceLinesElements.bottomRightVertical) {
        const lineHeight = Math.max(0, viewportHeight - elementBottom);
        const isVisible =
          elementRight >= -REFERENCE_LINE_THICKNESS &&
          elementRight <= viewportWidth + REFERENCE_LINE_THICKNESS &&
          elementBottom <= viewportHeight + REFERENCE_LINE_THICKNESS &&
          lineHeight >= 0;

        batchDOMUpdate(referenceLinesElements.bottomRightVertical, {
          left: `${elementRight}px`,
          top: `${elementBottom}px`,
          width: REFERENCE_LINE_THICKNESS_PX,
          height: `${lineHeight}px`,
          display: isVisible ? 'block' : 'none',
        });
      }

      // Show the reference lines container
      showReferenceLines();

      debugLog('[Scope] Updated L-corner reference lines for element:', {
        selector: getElementSelector(element),
        corners: {
          topLeft: [elementLeft, elementTop],
          topRight: [elementRight, elementTop],
          bottomLeft: [elementLeft, elementBottom],
          bottomRight: [elementRight, elementBottom],
        },
        viewport: { width: viewportWidth, height: viewportHeight },
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

  function groupRectsByAxis(rects, axis) {
    const useRowAxis = axis === 'row';
    const sorted = rects
      .slice()
      .sort((a, b) => (useRowAxis ? a.top - b.top : a.left - b.left));

    const groups = [];

    for (const rect of sorted) {
      const value = useRowAxis ? rect.top : rect.left;
      let targetGroup = null;

      for (const group of groups) {
        const delta = Math.abs(value - group.reference);
        if (delta <= GAP_ALIGNMENT_THRESHOLD) {
          targetGroup = group;
          break;
        }
      }

      if (!targetGroup) {
        targetGroup = {
          rects: [],
          minLeft: rect.left,
          maxRight: rect.right,
          minTop: rect.top,
          maxBottom: rect.bottom,
          reference: value,
        };
        groups.push(targetGroup);
      }

      targetGroup.rects.push(rect);
      targetGroup.minLeft = Math.min(targetGroup.minLeft, rect.left);
      targetGroup.maxRight = Math.max(targetGroup.maxRight, rect.right);
      targetGroup.minTop = Math.min(targetGroup.minTop, rect.top);
      targetGroup.maxBottom = Math.max(targetGroup.maxBottom, rect.bottom);
      targetGroup.reference =
        (targetGroup.reference * (targetGroup.rects.length - 1) + value) /
        targetGroup.rects.length;
    }

    return groups;
  }

  function computeGapRectangles(element, containerRect, layout) {
    const results = [];

    if (!element || !containerRect || !layout) {
      return results;
    }

    const { rowGap = 0, columnGap = 0 } = layout;
    const hasRowGap = rowGap > GAP_EPSILON;
    const hasColumnGap = columnGap > GAP_EPSILON;

    if (!hasRowGap && !hasColumnGap) {
      return results;
    }

    // Get container padding to properly calculate content area
    const containerStyle = window.getComputedStyle(element);
    const paddingTop = parseFloat(containerStyle.paddingTop) || 0;
    const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
    const paddingBottom = parseFloat(containerStyle.paddingBottom) || 0;
    const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;

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

    if (hasColumnGap) {
      const columnGroups = groupRectsByAxis(childRects, 'column').sort(
        (a, b) => a.minLeft - b.minLeft
      );

      for (let index = 1; index < columnGroups.length; index += 1) {
        const prev = columnGroups[index - 1];
        const curr = columnGroups[index];
        const spaceWidth = curr.minLeft - prev.maxRight;

        if (spaceWidth <= GAP_EPSILON) {
          continue;
        }

        const targetWidth = Math.min(columnGap, spaceWidth);
        const centeredLeft =
          prev.maxRight + Math.max((spaceWidth - targetWidth) / 2, 0);
        const left = Math.max(containerRect.left + paddingLeft, centeredLeft);
        const right = Math.min(
          containerRect.left + containerRect.width - paddingRight,
          left + targetWidth
        );
        const width = right - left;

        if (width <= GAP_EPSILON) {
          continue;
        }

        // Span full content height (inside padding)
        const top = containerRect.top + paddingTop;
        const height = containerRect.height - paddingTop - paddingBottom;

        if (height <= GAP_EPSILON) {
          continue;
        }

        results.push({ left, top, width, height });
      }
    }

    if (hasRowGap) {
      const rowGroups = groupRectsByAxis(childRects, 'row').sort(
        (a, b) => a.minTop - b.minTop
      );

      for (let index = 1; index < rowGroups.length; index += 1) {
        const prev = rowGroups[index - 1];
        const curr = rowGroups[index];
        const spaceHeight = curr.minTop - prev.maxBottom;

        if (spaceHeight <= GAP_EPSILON) {
          continue;
        }

        const targetHeight = Math.min(rowGap, spaceHeight);
        const centeredTop =
          prev.maxBottom + Math.max((spaceHeight - targetHeight) / 2, 0);
        const top = Math.max(containerRect.top + paddingTop, centeredTop);
        const bottom = Math.min(
          containerRect.top + containerRect.height - paddingBottom,
          top + targetHeight
        );
        const height = bottom - top;

        if (height <= GAP_EPSILON) {
          continue;
        }

        // Span full content width (inside padding)
        const left = containerRect.left + paddingLeft;
        const width = containerRect.width - paddingLeft - paddingRight;

        if (width <= GAP_EPSILON) {
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

      for (
        let index = gapRects.length;
        index < gapOverlayParts.length;
        index += 1
      ) {
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

      // Create reference lines if enabled
      if (ENABLE_REFERENCE_LINES) {
        createReferenceLines();
      }

      // Log element being highlighted
      debugLog('[Scope] Highlighted element:', {
        tag: element.tagName.toLowerCase(),
        selector: getElementSelector(element),
        id: element.id || '(no id)',
        classes: safeGetClassName(element) || '(no classes)',
        text: element.textContent?.substring(0, 50) || '(no text)',
      });

      // Show reference lines for current element
      if (ENABLE_REFERENCE_LINES) {
        updateReferenceLines(element);
      }

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
