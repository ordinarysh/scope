export default {
  // Basic formatting
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',

  // Trailing commas for better diffs
  trailingComma: 'es5',

  // Bracket spacing for readability
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow function parentheses
  arrowParens: 'avoid',

  // Line endings (consistent across platforms)
  endOfLine: 'lf',

  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',

  // HTML/CSS specific (for popup.html and CSS files)
  htmlWhitespaceSensitivity: 'css',

  // Override settings for specific file types
  overrides: [
    {
      files: ['**/*.json'],
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
    {
      files: ['**/manifest.json'],
      options: {
        printWidth: 120,
        tabWidth: 2,
        // Keep manifest.json more readable
        trailingComma: 'none',
      },
    },
    {
      files: ['**/*.css'],
      options: {
        singleQuote: false, // CSS typically uses double quotes
      },
    },
    {
      files: ['**/*.html'],
      options: {
        printWidth: 120,
        singleQuote: false, // HTML attributes use double quotes
      },
    },
  ],
};