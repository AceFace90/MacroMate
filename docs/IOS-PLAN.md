# MacroMate native iOS app — build spec

Goal: replicate what was done for LabMate (`/Users/wcorrey/Claude/personal/LabMate/LabMate App/LabMate/`) for MacroMate:
a native SwiftUI app styled after the redesigned Apple Health app, sharing the web app's backend (Supabase, not Firebase).

**Reference implementation — read before writing code:** LabMate iOS (`.../LabMate App/LabMate/LabMate/`):
`Design/HealthTheme.swift`, `Services/AppStore.swift`, `Services/LocalStore.swift`, `Services/AuthService.swift`,
`Services/HealthKitService.swift`, `Views/RootView.swift`, `Views/Settings/SettingsView.swift`, `Views/Settings/SplashView.swift`,
`Views/Insights/*`. Copy its conventions (file layout, `@Observable @MainActor AppStore`, `HealthCard`, `HealthPage`,
`SummaryChip`, `ScoreRing`, cache-first launch, `nonisolated` value types, Swift 6 strict concurrency).

**Web source of truth for logic:** `/Users/wcorrey/Claude/personal/MacroMate/src/` (React Native/Expo).

## Project

- Xcode project: `/Users/wcorrey/Claude/personal/MacroMate/MacroMate App/MacroMate App/MacroMate App.xcodeproj`
  (new-style JSON `project.xcproj`; the `MacroMate App/` folder is a synced folder — any file dropped in it is compiled/bundled).
  Sources: `.../MacroMate App/MacroMate App/MacroMate App/`. Target + scheme: `MacroMate App`.
- The Xcode-created nested `.git` was removed; the app is tracked in the MacroMate repo.
- Build: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project "<path>/MacroMate App.xcodeproj" -scheme "MacroMate App" -destination 'platform=iOS Simulator,name=iPhone 17' build`
  (`xcode-select` points at CommandLineTools, so DEVELOPER_DIR is required.)
- Project settings to mirror LabMate's `project.xcproj` target settings: iOS only (`SUPPORTED_PLATFORMS = iphoneos iphonesimulator`,
  `SUPPORTS_MACCATALYST NO`, `TARGETED_DEVICE_FAMILY 1,2`, remove macOS/visionOS sandbox keys incl. `ENABLE_APP_SANDBOX`,
  `ENABLE_OUTGOING_NETWORK_CONNECTIONS`), `SWIFT_VERSION 6.0`, `IPHONEOS_DEPLOYMENT_TARGET 27.0`, keep
  `DEVELOPMENT_TEAM FQ7MMD3P9X` and bundle id `com.wallacecorreypersonalteam.MacroMateApp`.
  `INFOPLIST_KEY_CFBundleDisplayName = MacroMate`, category `public.app-category.healthcare-fitness`,
  `ASSETCATALOG_COMPILER_APPICON_NAME AppIcon`, `CODE_SIGN_ENTITLEMENTS MacroMate.entitlements` (HealthKit, like LabMate),
  usage strings: `NSCameraUsageDescription` (barcode + food/label photos), `NSPhotoLibraryUsageDescription`,
  `NSHealthShareUsageDescription` (read weight), `NSHealthUpdateUsageDescription` (write calories/protein/carbs/fat).
- Swift package: `https://github.com/supabase/supabase-swift`, up-to-next-major from `2.0.0`, product `Supabase`.
  After adding, run `xcodebuild -resolvePackageDependencies` and **read the resolved package sources** (DerivedData
  `SourcePackages/checkouts/supabase-swift`) to confirm API signatures — do not guess.
- App icon: `/Users/wcorrey/Claude/personal/MacroMate/assets/icon.png` (1024²) → `Assets.xcassets/AppIcon.appiconset` and `AppLogo.imageset`.
- Bundled food data: copy `src/data/afcd_foods.json` and `src/data/opennutrition_foods.json` into `Resources/`.
- Delete the template `ContentView.swift` (it imports `Playgrounds`); `MyApp.swift` becomes `MacroMateApp`.

## Backend (Supabase) — must stay compatible with the web app

- URL `https://vzcmeubfdjdwqhxihusw.supabase.co`, publishable key `sb_publishable_HE9bJbtQHMvmO1S0nHZ_-g_qoNFDskA`
  (safe to ship; RLS protects data — never use an `sb_secret_*` key). Put in `Services/SupabaseConfig.swift`.
- Auth: Google OAuth via `client.auth.signInWithOAuth(provider: .google, redirectTo: URL(string: "macromate://auth-callback"))`
  (ASWebAuthenticationSession). Register URL scheme `macromate` in an Info plist (`MacroMate-Info.plist`, like LabMate's),
  plus `.onOpenURL { client.auth.handle($0) }`. User must add `macromate://auth-callback` to Supabase Auth redirect allowlist.
- Table `food_logs` (RLS own rows): `id text pk` (client UUID string), `user_id uuid`, `logged_date date` ("YYYY-MM-DD" local),
  `name text`, `calories int`, `protein_g/carbs_g/fat_g numeric(6,1)`, `quantity_g numeric`, `source text`,
  `logged_at timestamptz`, `meal_type text` (`BREAKFAST|LUNCH|DINNER|SNACK`, default BREAKFAST).
- Table `profiles` (`id` = auth uid): `name, weight_kg, height_cm, dob (date), gender (MALE|FEMALE|OTHER),
  activity_level (SEDENTARY|LIGHT|MODERATE|VERY|EXTRA), country (default AU), goal_type (WEIGHT_LOSS|MAINTENANCE|MUSCLE_GAIN),
  calorie_deficit int, protein_per_kg numeric, carbs_fat_split text ("50/50"), updated_at`. Upsert `onConflict: id`.
- Sync semantics: port `src/store/logStore.js` — pull last 90 days, cloud is truth per date, but replay local adds/edits/deletes
  made this session before the snapshot landed. Writes are optimistic (local first, then cloud). Signed-out = local-only.
  Same `loggedAtFor(date)` rule (today = now, back-dated = local noon).

## Logic to port (src → Swift, `Logic/`)

- `services/calculations.js` → `Calculations.swift`: BMR (Mifflin-St Jeor, OTHER = -78), TDEE multipliers, age,
  `computeGoalTargets(profile)` exactly (WEIGHT_LOSS default -500, MUSCLE_GAIN default +200, protein-first macros,
  default split "50/50", protein 2.0 g/kg). Default targets 2000/150/200/67.
- `quantityExtraction.js` → `QuantityExtraction.swift` (parse "200g chicken", "2 eggs", "1 cup rice" → grams + food name).
- Search: `FoodSearchService` — tiers in order: history (previously logged entries, by recency/frequency),
  saved foods (local verified cache), AFCD (country AU only), OpenNutrition (bundled JSON, load once off-main),
  then Open Food Facts API (`https://world.openfoodfacts.org/cgi/search.pl?...json=1`, User-Agent `MacroMate/1.0 (iOS)`,
  debounced, only on explicit submit, rate-limit friendly). Port serving-size parsing from `openFoodFactsAPI.js`.
  Barcode: `https://world.openfoodfacts.org/api/v2/product/{code}.json`.
  Result type carries per-100g nutrition + optional serving size so the quantity picker can scale.
- `gemini.js` → `GeminiService.swift`: `analyzeFood(text)`, `analyzeMealPhoto(jpeg)` → items, `analyzeLabel(jpeg)`,
  model `gemini-2.5-flash-lite`, same prompts + defensive validation. User's own API key stored in **Keychain**, never synced.
  Meal-photo items are resolved through `FoodSearchService` then Gemini `analyzeFood` fallback (like `AIMealPanel`).

## UI (Health app design language — reuse LabMate's `HealthTheme` renamed `MacroTheme`)

Colours: calories = green (`#34C759`-ish, readable both modes), protein = blue, carbs = orange, fat = yellow — match web
`theme/index.js` intent. Tabs (floating Liquid Glass `TabView`, `.tabBarMinimizeBehavior(.onScrollDown)`, "+" toolbar on Today):

1. **Today** — date navigator (‹ day ›, tap title for date picker), large headline + narrative ("620 kcal left"),
   concentric activity rings (calories outer? — follow web `ActivityRings`: protein/carbs/fat rings + calorie centre),
   macro chips, meal sections (Breakfast/Lunch/Dinner/Snack) as `HealthCard`s with entries; swipe to delete,
   tap to edit (quantity rescales macros, meal change, manual macro edits). "+" opens **Add Food** sheet:
   search field with live local results + "Search online", recent foods, buttons for **Scan Barcode**
   (VisionKit `DataScannerViewController`, EAN/UPC), **Meal Photo** and **Nutrition Label** (camera/PhotosPicker → Gemini).
   Selecting a food → quantity + meal picker detail → log. "Food history" link → full history list.
2. **Trends** — Swift Charts: range picker 7/30/90 days, daily calories vs target bar chart, macro averages,
   adherence/streak cards, weight trend from HealthKit if enabled. Port intent of `screens/ProgressScreen.js`.
3. **Profile** — inset-grouped form: name, weight, height, DOB, gender, activity, country, goal type, deficit/surplus,
   protein g/kg, carbs/fat split; live "Current Goals" card (BMR/TDEE/targets) above. Save → Supabase upsert.
4. **Settings** — LabMate-style inset-grouped list: account (sign in/out), appearance (auto/light/dark),
   Apple Health toggle (write each day's totals as dietary samples, MacroMate-owned samples only, never delete others';
   read latest body mass to prefill weight), Gemini API key, export data (JSON share), about.

Splash (signed-out first launch): logo, "Sign in with Google", "Continue without account" — like LabMate `SplashView`.

## Done when

Builds clean (no warnings from our code) on iPhone 17 simulator; app launches; local-only logging works end-to-end;
`#Preview`s for main views use sample data.
