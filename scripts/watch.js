#!/usr/bin/env node

import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extension resources directory
const EXTENSION_DIR = join(__dirname, '..', 'scope Extension', 'Resources');

// File patterns to watch
const WATCH_PATTERNS = [
  join(EXTENSION_DIR, '**/*.js'),
  join(EXTENSION_DIR, '**/*.css'),
  join(EXTENSION_DIR, '**/*.html'),
  join(EXTENSION_DIR, '**/*.json'),
];

// Files to ignore
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.DS_Store',
  '**/.*', // Hidden files
];

console.log('🔍 Starting file watcher for Safari Web Extension...');
console.log(`📁 Watching: ${EXTENSION_DIR}`);
console.log('📝 Monitoring: *.js, *.css, *.html, *.json files');
console.log('');
console.log('💡 After making changes, manually reload the extension in Safari:');
console.log('   Safari → Develop → Web Extensions → Scope → Reload Extension');
console.log('');

// Initialize watcher
const watcher = chokidar.watch(WATCH_PATTERNS, {
  ignored: IGNORE_PATTERNS,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 1000,
    pollInterval: 100,
  },
});

// Helper function to format timestamps
function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Helper function to get relative path
function getRelativePath(filePath) {
  return filePath.replace(process.cwd() + '/', '');
}

// Helper function to get file type emoji
function getFileEmoji(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': return '📜';
    case 'css': return '🎨';
    case 'html': return '📄';
    case 'json': return '📋';
    default: return '📁';
  }
}

// Event handlers
watcher
  .on('add', (path) => {
    const emoji = getFileEmoji(path);
    const relativePath = getRelativePath(path);
    console.log(`${formatTime()} ${emoji} Added: ${relativePath}`);
  })
  .on('change', (path) => {
    const emoji = getFileEmoji(path);
    const relativePath = getRelativePath(path);
    console.log(`${formatTime()} ${emoji} Changed: ${relativePath}`);

    // Show reload reminder for important files
    const fileName = path.split('/').pop();
    if (['manifest.json', 'background.js', 'content.js'].includes(fileName)) {
      console.log('🔄 Extension reload recommended!');
    }
  })
  .on('unlink', (path) => {
    const emoji = getFileEmoji(path);
    const relativePath = getRelativePath(path);
    console.log(`${formatTime()} 🗑️  Removed: ${relativePath}`);
  })
  .on('error', (error) => {
    console.error('❌ Watcher error:', error);
  })
  .on('ready', () => {
    console.log('✅ File watcher ready - waiting for changes...');
    console.log('   Press Ctrl+C to stop watching\n');
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Stopping file watcher...');
  watcher.close().then(() => {
    console.log('✅ File watcher stopped');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});