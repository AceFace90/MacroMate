# Handoff — MacroMate — 2026-11-17

**Last session:** Installed the latest MacroMate iOS debug build on Wallace's iPhone; everything is pushed (`3d7b569`) ahead of moving the directory to another machine.
**Repo:** `github-personal:AceFace90/MacroMate`. Two codebases: Expo/React Native (`App.js`, `src/`, web build is the PWA, backend Supabase) and native SwiftUI iOS (`MacroMate App/`).

**Done (all pushed):**
- iOS `LocalStore` writes `schema-version.json` (v1) with `migrateIfNeeded()`; exports include `schemaVersion`; theme/settings polish on iOS and web.
- `.codex/` is now gitignored (it holds a local API key; never commit it).

**Build/install:** `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project "MacroMate App/MacroMate App/MacroMate App.xcodeproj" -scheme "MacroMate App" -destination id=<device> -allowProvisioningUpdates build`, then `xcrun devicectl device install app`. Free account: re-install within 7 days.

## Open loops
- `MacroMate/.codex/config.toml` (local, untracked) contains an API key; it will travel with the directory. Rotate or move it to an env var when convenient.
- SwiftUI colour collision: `MacroColor.calories` is the same green as the app tint/buttons; recommended fix is a new `MacroColor.accent` and a pink `calories` (#ff375f) to match Expo.
- Sign in with Apple hidden until a paid Apple developer account.
- Shared confirm/toast replacing `Alert`/`window.confirm` (about 20 call sites); accessibility labels on iOS; Add Food button not checked in a simulator.
- Deferred: realtime sync, shared sync Swift package.
