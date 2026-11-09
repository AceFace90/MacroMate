import Foundation
import Observation
import SwiftUI

/// Single source of truth for the app. Cache-first: launch paints from the on-disk snapshot, then
/// Supabase delivers the last 90 days. Writes are optimistic (local first, then cloud) and replay
/// semantics match src/store/logStore.js. Signed-out = local-only.
@Observable
@MainActor
final class AppStore {
    // MARK: Services
    let auth = AuthService()
    let search = FoodSearchService()
    let gemini = GeminiService()
    /// On-device / Private Cloud Compute / Gemini fallback.
    @ObservationIgnored lazy var ai = FoodAI(geminiKey: { [unowned self] in self.geminiKey })
    let health = HealthKitService()
    @ObservationIgnored private let cloud = CloudStore()

    // MARK: State
    /// Logged foods by local date key ("YYYY-MM-DD").
    private(set) var entries: [String: [FoodEntry]] = [:]
    private(set) var profile: Profile = .empty
    private(set) var savedFoods: [SavedFood] = []
    private(set) var isSyncing = false
    /// Shown by RootView's alert; set to nil to dismiss.
    var errorMessage: String?
    /// Set once the first auth state has been applied and the right cache loaded.
    private(set) var isReady = false
    /// Signed-out user chose "Continue without account" (or signed in once).
    private(set) var hasOnboarded = LocalStore.hasOnboarded

    var theme: ThemePreference {
        didSet { UserDefaults.standard.set(theme.rawValue, forKey: "macromate:theme") }
    }
    var healthEnabled: Bool {
        didSet {
            UserDefaults.standard.set(healthEnabled, forKey: "macromate:healthEnabled")
            if healthEnabled { Task { await syncHealth(days: 7, requestAccess: true) } }
        }
    }
    /// User's own Gemini key (Keychain, never synced).
    var geminiKey: String {
        didSet { KeychainStore.geminiKey = geminiKey.trimmingCharacters(in: .whitespacesAndNewlines) }
    }
    var hasGeminiKey: Bool { !geminiKey.trimmingCharacters(in: .whitespaces).isEmpty }

    var user: AuthUser? { auth.user }
    var isSignedIn: Bool { auth.user != nil }
    /// Splash shows for signed-out first launch only.
    var showsSplash: Bool { isReady && !isSignedIn && !hasOnboarded }

    /// Daily targets: computed from the profile, else the defaults (2000/150/200/67).
    var targets: Targets { Calculations.computeGoalTargets(profile) ?? .defaults }
    var hasComputedTargets: Bool { Calculations.computeGoalTargets(profile) != nil }

    // MARK: Replay bookkeeping (see logStore.js)
    @ObservationIgnored private var localWrites: [String: FoodEntry] = [:]
    @ObservationIgnored private var pendingDeletes = Set<String>()
    @ObservationIgnored private var syncGeneration = 0
    @ObservationIgnored private var healthTask: Task<Void, Never>?

    private var activeStore: LocalStore { auth.user.map { .cloudCache(uid: $0.uid) } ?? LocalStore() }

    // MARK: Lifecycle

    init() {
        theme = ThemePreference(rawValue: UserDefaults.standard.string(forKey: "macromate:theme") ?? "") ?? .auto
        healthEnabled = UserDefaults.standard.bool(forKey: "macromate:healthEnabled")
        geminiKey = KeychainStore.geminiKey ?? ""
        // Paint instantly from the last account's cache (or the local store) before auth restores.
        loadCache(LocalStore.lastUid.map { .cloudCache(uid: $0) } ?? LocalStore())
    }

    /// Call once at launch.
    func start() {
        search.warmUp()
        auth.onUserChange = { [weak self] user in self?.userChanged(user) }
        auth.start()
    }

    private func loadCache(_ store: LocalStore) {
        entries = store.loadEntries()
        profile = store.loadProfile()
        savedFoods = LocalStore().loadSavedFoods()
    }

    private func userChanged(_ user: AuthUser?) {
        localWrites.removeAll(); pendingDeletes.removeAll()
        syncGeneration += 1
        if let user {
            LocalStore.lastUid = user.uid
            LocalStore.hasOnboarded = true
            hasOnboarded = true
            loadCache(.cloudCache(uid: user.uid))
            isReady = true
            Task { await sync() }
        } else {
            LocalStore.lastUid = nil
            LocalStore.clearAllCloudCaches()
            loadCache(LocalStore())
            isReady = true
        }
    }

    /// Pulls the last 90 days + profile. Cloud is truth per date, but local adds/edits/deletes made
    /// before the snapshot landed are replayed on top.
    func sync() async {
        guard let uid = auth.user?.uid else { return }
        let generation = syncGeneration
        isSyncing = true
        defer { isSyncing = false }
        do {
            let remote = try await cloud.fetchLogs(userId: uid)
            guard generation == syncGeneration else { return }
            var merged = entries
            for (date, cloudEntries) in remote {
                let cloudIds = Set(cloudEntries.map(\.id))
                let reconciled = cloudEntries.filter { !pendingDeletes.contains($0.id) }.map { localWrites[$0.id] ?? $0 }
                let localOnly = (entries[date] ?? []).filter { !cloudIds.contains($0.id) && !pendingDeletes.contains($0.id) }
                merged[date] = reconciled + localOnly
            }
            entries = merged
            activeStore.saveEntries(merged)
            if let p = try await cloud.fetchProfile(userId: uid), generation == syncGeneration {
                profile = p
                activeStore.saveProfile(p)
            }
            if healthEnabled { await syncHealth(days: 7) }
        } catch {
            // Offline / expired session: keep showing the cache.
            if generation == syncGeneration { report("Couldn't sync with the cloud: \(error.localizedDescription)") }
        }
    }

    // MARK: Reading

    func entries(for date: String) -> [FoodEntry] { entries[date] ?? [] }
    func entries(for date: String, meal: MealType) -> [FoodEntry] { entries(for: date).filter { $0.mealType == meal } }
    func totals(for date: String) -> MacroTotals { Calculations.sum(entries(for: date)) }
    /// Recently logged foods as search items (newest first).
    func historyFoods() -> [FoodItem] { FoodSearchService.historyItems(from: entries) }

    // MARK: Writing entries

    /// Logs a food. `loggedAt` is derived from `date` (today = now, back-dated = local noon) and the
    /// values are rounded like the web `addEntry`. Returns the stored entry.
    @discardableResult
    func addEntry(_ draft: FoodEntry, on date: String) -> FoodEntry {
        var entry = draft
        entry.id = UUID().uuidString
        entry.calories = Int(Double(draft.calories).rounded())
        entry.proteinG = MacroTotals.round1(draft.proteinG)
        entry.carbsG = MacroTotals.round1(draft.carbsG)
        entry.fatG = MacroTotals.round1(draft.fatG)
        entry.quantityG = draft.quantityG > 0 ? draft.quantityG : 100
        entry.loggedAt = DateUtils.loggedAtFor(date)
        localWrites[entry.id] = entry
        pendingDeletes.remove(entry.id)
        entries[date, default: []].append(entry)
        persistEntries()
        pushToCloud(entry, date: date)
        scheduleHealthSync(date)
        return entry
    }

    /// Logs `grams` of a search result and remembers it in saved foods.
    @discardableResult
    func log(_ item: FoodItem, grams: Double, meal: MealType, on date: String) -> FoodEntry {
        remember(item)
        return addEntry(item.entry(grams: grams, mealType: meal), on: date)
    }

    func updateEntry(_ entry: FoodEntry, on date: String) {
        guard let i = entries[date]?.firstIndex(where: { $0.id == entry.id }) else { return }
        entries[date]?[i] = entry
        localWrites[entry.id] = entry
        persistEntries()
        pushToCloud(entry, date: date)
        scheduleHealthSync(date)
    }

    func removeEntry(id: String, on date: String) {
        pendingDeletes.insert(id)
        localWrites[id] = nil
        entries[date]?.removeAll { $0.id == id }
        persistEntries()
        if let uid = auth.user?.uid {
            _ = uid
            Task { do { try await cloud.delete(id: id) } catch { report("Couldn't delete from the cloud: \(error.localizedDescription)") } }
        }
        scheduleHealthSync(date)
    }

    private func persistEntries() { activeStore.saveEntries(entries) }

    private func pushToCloud(_ entry: FoodEntry, date: String) {
        guard let uid = auth.user?.uid else { return }
        Task {
            do { try await cloud.upsert(entry, date: date, userId: uid) }
            catch { report("Couldn't save to the cloud (kept on this device): \(error.localizedDescription)") }
        }
    }

    /// Saves a food to the device-local verified cache (search tier 2).
    func remember(_ item: FoodItem) {
        guard item.source != .history else { return }
        if let i = savedFoods.firstIndex(where: { QuantityExtraction.normalizeFoodName($0.item.name) == QuantityExtraction.normalizeFoodName(item.name) }) {
            savedFoods[i].usageCount += 1
            savedFoods[i].lastUsed = Date()
        } else {
            savedFoods.append(SavedFood(item: item))
        }
        if savedFoods.count > 300 {
            savedFoods = Array(savedFoods.sorted { $0.lastUsed > $1.lastUsed }.prefix(300))
        }
        LocalStore().saveSavedFoods(savedFoods)
    }

    // MARK: Profile

    /// Saves locally, then upserts to Supabase when signed in. Returns false if the cloud write failed.
    @discardableResult
    func saveProfile(_ new: Profile) async -> Bool {
        profile = new
        activeStore.saveProfile(new)
        guard let uid = auth.user?.uid else { return true }
        do { try await cloud.saveProfile(new, userId: uid); return true }
        catch { report("Couldn't save your profile to the cloud: \(error.localizedDescription)"); return false }
    }

    // MARK: Auth

    func signIn() async {
        do { try await auth.signInWithGoogle() }
        catch {
            // Closing the web sheet is not an error worth alerting.
            if (error as NSError).code != 1 { report("Sign-in failed: \(error.localizedDescription)") }
        }
    }

    func signInWithApple() async {
        do { try await auth.signInWithApple() }
        catch {
            if (error as NSError).code != 1 { report("Sign-in failed: \(error.localizedDescription)") }
        }
    }

    func deleteAccount() async {
        do { try await auth.deleteAccount() }
        catch { report("Couldn't delete account: \(error.localizedDescription)") }
    }

    func signOut() async {
        do { try await auth.signOut() } catch { report("Sign-out failed: \(error.localizedDescription)") }
    }

    /// Splash: use the app locally without an account.
    func continueWithoutAccount() {
        LocalStore.hasOnboarded = true
        hasOnboarded = true
    }

    func handle(_ url: URL) { auth.handle(url) }

    // MARK: Apple Health

    /// Debounced per-day write of dietary totals (only when enabled).
    private func scheduleHealthSync(_ date: String) {
        guard healthEnabled else { return }
        healthTask?.cancel()
        healthTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled, let self else { return }
            await self.writeHealth(day: date)
        }
    }

    private func writeHealth(day: String) async {
        do { try await health.writeDay(day, totals: totals(for: day)) }
        catch { report("Couldn't update Apple Health: \(error.localizedDescription)") }
    }

    /// Writes the last `days` days to Health (on enable, foreground, after sync).
    func syncHealth(days: Int, requestAccess: Bool = false) async {
        guard healthEnabled, health.isAvailable else { return }
        if requestAccess {
            do { try await health.requestAuthorisation() }
            catch { report("Apple Health access failed: \(error.localizedDescription)"); return }
        }
        for day in DateUtils.previousDays(days) { await writeHealth(day: day) }
    }

    /// Latest weight from Health, for prefilling the profile.
    func latestHealthWeight() async -> Double? { await health.latestBodyMass()?.kg }

    // MARK: Export / misc

    func exportJSON() -> String { LocalStore.exportJSON(entries: entries, profile: profile) }

    /// Writes the export to a temp file for ShareLink.
    func exportFileURL() -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("MacroMate-export.json")
        do { try exportJSON().write(to: url, atomically: true, encoding: .utf8); return url } catch { return nil }
    }

    func report(_ message: String) { errorMessage = message }
}

// MARK: - Sample data for previews

extension AppStore {
    /// A store seeded with a few entries for today (previews only; never started).
    static var preview: AppStore {
        let s = AppStore()
        let today = DateUtils.todayStr()
        s.entries = [today: [
            FoodEntry(name: "Oats with milk", calories: 320, proteinG: 14, carbsG: 48, fatG: 8, quantityG: 250, mealType: .breakfast),
            FoodEntry(name: "Chicken salad", calories: 450, proteinG: 38, carbsG: 20, fatG: 24, quantityG: 320, mealType: .lunch),
            FoodEntry(name: "Apple", calories: 80, proteinG: 0.4, carbsG: 21, fatG: 0.3, quantityG: 150, mealType: .snack),
        ]]
        s.profile = Profile(name: "Sam", weightKg: 75, heightCm: 178, dob: "1990-05-01", gender: .male,
                            activityLevel: .moderate, country: "AU", goalType: .maintenance)
        s.isReadyForPreview()
        return s
    }
    fileprivate func isReadyForPreview() { isReady = true; hasOnboarded = true }
}
