import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Apply recommended rules to all JS files
  js.configs.recommended,

  // Global configuration for all JavaScript files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser environment
        ...globals.browser,

        // Web Extension APIs (Safari uses Chrome's API)
        chrome: 'readonly',
        browser: 'readonly',

        // Safari Web Extension specific
        safari: 'readonly',

        // Common extension globals
        console: 'readonly',
      },
    },
    rules: {
      // Best practices for browser extensions
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-console': 'off', // Allow console in extensions for debugging
      'prefer-const': 'error',
      'no-var': 'error',

      // Web Extension specific rules
      'no-undef': 'error', // Catch undefined globals
      'no-implicit-globals': 'error', // Prevent global pollution

      // Code quality
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // Modern JS practices
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
    },
  },

  // Configuration specific to content scripts
  {
    files: ['**/content*.js', '**/inject*.js'],
    languageOptions: {
      globals: {
        // Content scripts run in web page context
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        history: 'readonly',

        // Allow content script specific APIs
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
      },
    },
    rules: {
      // Content scripts should be careful with globals
      'no-implicit-globals': 'error',

      // DOM manipulation best practices
      'no-inner-declarations': 'off', // Allow function declarations in blocks for content scripts
    },
  },

  // Configuration specific to background scripts
  {
    files: ['**/background*.js', '**/service-worker*.js'],
    languageOptions: {
      globals: {
        // Background scripts don't have DOM access
        // Only Web Extension APIs
        importScripts: 'readonly', // For service workers
      },
    },
    rules: {
      // Background scripts shouldn't use DOM APIs
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'window is not available in background scripts',
        },
        {
          name: 'document',
          message: 'document is not available in background scripts',
        },
      ],
    },
  },

  // Configuration for popup scripts
  {
    files: ['**/popup*.js'],
    languageOptions: {
      globals: {
        // Popup has limited DOM access
        window: 'readonly',
        document: 'readonly',
      },
    },
  },

  // Ignore build artifacts and system files
  {
    ignores: [
      '**/node_modules/**',
      '**/build/**',
      '**/dist/**',
      '**/.DS_Store',
      '**/DerivedData/**',
      '**/*.xcworkspace/**',
      '**/*.xcodeproj/**',
      '**/.git/**',
    ],
  },

  // Prettier integration - must be last to override conflicting rules
  prettierConfig,
];