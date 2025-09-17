// Background script for Scope extension
(function () {
  'use strict';

  console.log('[Scope Background] Background script loaded');

  // Handle extension icon clicks
  browser.action.onClicked.addListener(async tab => {
    console.log('[Scope Background] Extension icon clicked on tab:', tab.id);

    try {
      // Get current state and toggle it
      const result = await browser.storage.sync.get(['scopeEnabled']);
      const currentState = result.scopeEnabled || false;
      const newState = !currentState;

      console.log(
        '[Scope Background] Toggling from',
        currentState,
        'to',
        newState
      );

      // Save new state
      await browser.storage.sync.set({ scopeEnabled: newState });

      // Send message to the active tab's content script
      try {
        await browser.tabs.sendMessage(tab.id, {
          action: 'setHighlighting',
          enabled: newState,
        });
        console.log(
          '[Scope Background] Sent toggle message to active tab:',
          tab.id
        );
      } catch {
        console.log(
          '[Scope Background] Could not send message to tab',
          tab.id,
          '(likely no content script)'
        );
      }
    } catch (error) {
      console.error('[Scope Background] Error handling icon click:', error);
    }
  });

  // Handle messages from content scripts (for state sync)
  browser.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
      console.log('[Scope Background] Received message:', request);

      try {
        if (request.action === 'disableHighlighting') {
          // Content script is reporting that highlighting was disabled (e.g., by clicking)
          await browser.storage.sync.set({ scopeEnabled: false });
          console.log(
            '[Scope Background] Highlighting disabled by content script'
          );
          sendResponse({ success: true });
        } else if (request.action === 'getState') {
          // Return current state
          const result = await browser.storage.sync.get(['scopeEnabled']);
          const isEnabled = result.scopeEnabled || false;
          console.log('[Scope Background] Returning current state:', isEnabled);
          sendResponse({ enabled: isEnabled });
        }
      } catch (error) {
        console.error('[Scope Background] Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      }

      return true; // Keep message channel open for async response
    }
  );

  // Initialize extension state on install
  browser.runtime.onInstalled.addListener(async () => {
    console.log('[Scope Background] Extension installed/updated');

    try {
      // Set default state if not exists
      const result = await browser.storage.sync.get(['scopeEnabled']);
      if (result.scopeEnabled === undefined) {
        await browser.storage.sync.set({ scopeEnabled: false });
        console.log('[Scope Background] Set initial state: false');
      }
    } catch (error) {
      console.error('[Scope Background] Error during installation:', error);
    }
  });
})();
