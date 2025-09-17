# Repository Guidelines

## Project Structure & Module Organization
The macOS host app lives in `scope/` with AppKit entry points (`AppDelegate.swift`, `ViewController.swift`) and onboarding resources under `scope/Resources`. The Safari Web Extension ships from `scope Extension/Resources`, where `background.js`, `content.js`, and `manifest.json` mirror the browser runtime; keep localized strings in `_locales` and static assets in `images/`. Native tests live in `scopeTests` and `scopeUITests`, while JavaScript automation belongs beside the extension scripts; helper tooling such as the chokidar watcher sits in `scripts/`.

## Build, Test, and Development Commands
Use `npm install` to refresh Node tooling when dependencies change. Run `npm run watch` to tail extension assets during development; Safari still requires a manual reload (Develop → Web Extensions → Scope → Reload Extension). Quality gates are `npm run lint`, `npm run format:check`, and `npm run check` for the combined pass. Build the mac app through Xcode or CLI: `xcodebuild build -project scope.xcodeproj -scheme scope -destination 'platform=macOS'`. Execute unit and UI suites with `xcodebuild test -project scope.xcodeproj -scheme scope -destination 'platform=macOS'`.

## Coding Style & Naming Conventions
JavaScript follows the shared `eslint.config.js` rules: two-space indentation, `const`/`let` over `var`, and arrow callbacks in background and content scripts. Prettier governs formatting; run `npm run format` before committing sizable changes. Swift code uses four-space indentation, UpperCamelCase types, and lowerCamelCase methods; keep bundle identifiers in `extensionBundleIdentifier` format and prefer protocol extensions over globals. Place Safari extension-specific constants near their usage to match `ViewController.swift`.

## Testing Guidelines
Add Swift unit coverage in `scopeTests`, using the `Testing` module’s `@Test` functions and expressive `#expect` assertions. UI scenarios belong in `scopeUITests`, prefixed with `test` and guarded by `@MainActor` when interacting with `XCUIApplication`. For JavaScript, add targeted integration assertions with lightweight harnesses and document manual QA steps in the PR when automation is impractical.

## Commit & Pull Request Guidelines
Continue the Conventional Commit style seen in history (`feat:`, `fix:`, `refactor:`) and keep bodies imperative and scoped to one change. Before pushing, run `npm run check` and `xcodebuild test …` to keep CI green. Pull requests should describe the user impact, link any tracked issues, and include screenshots or screen recordings when UI overlays change; call out Safari extension reload requirements for reviewers.
