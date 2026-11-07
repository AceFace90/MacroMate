import Foundation

/// JSON persistence in Application Support. `LocalStore()` is the signed-out, local-only store;
/// `LocalStore.cloudCache(uid:)` is a per-account snapshot of the last cloud data so launch paints
/// instantly before auth/sync complete. Saved foods live in the root store (device-wide).
nonisolated struct LocalStore: Sendable {
    private static let onboardedKey = "macromate:onboarded:v1"
    private static let lastUidKey = "macromate:lastUid:v1"

    private let subpath: String

    init() { subpath = "MacroMate" }
    private init(subpath: String) { self.subpath = subpath }

    static func cloudCache(uid: String) -> LocalStore { LocalStore(subpath: "MacroMate/cloud-cache/\(uid)") }

    /// Account whose cache should be shown at launch (nil = signed out).
    static var lastUid: String? {
        get { UserDefaults.standard.string(forKey: lastUidKey) }
        set { UserDefaults.standard.set(newValue, forKey: lastUidKey) }
    }

    private var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent(subpath, isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private var entriesURL: URL { dir.appendingPathComponent("entries.json") }
    private var profileURL: URL { dir.appendingPathComponent("profile.json") }
    private var savedURL: URL { dir.appendingPathComponent("saved-foods.json") }

    private static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        e.outputFormatting = [.sortedKeys]
        return e
    }
    private static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .millisecondsSince1970
        return d
    }
    private func read<T: Decodable>(_ type: T.Type, _ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? Self.decoder().decode(T.self, from: data)
    }
    private func write<T: Encodable>(_ value: T, _ url: URL) {
        if let data = try? Self.encoder().encode(value) { try? data.write(to: url, options: .atomic) }
    }

    func loadEntries() -> [String: [FoodEntry]] { read([String: [FoodEntry]].self, entriesURL) ?? [:] }
    func saveEntries(_ e: [String: [FoodEntry]]) { write(e, entriesURL) }
    func loadProfile() -> Profile { read(Profile.self, profileURL) ?? .empty }
    func saveProfile(_ p: Profile) { write(p, profileURL) }
    func loadSavedFoods() -> [SavedFood] { read([SavedFood].self, savedURL) ?? [] }
    func saveSavedFoods(_ s: [SavedFood]) { write(s, savedURL) }

    /// Removes logs + profile (not saved foods or the onboarded flag).
    func clearAll() {
        for u in [entriesURL, profileURL] { try? FileManager.default.removeItem(at: u) }
    }

    /// Deletes every per-account cache (sign out / account switch on a shared device).
    static func clearAllCloudCaches() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.removeItem(at: base.appendingPathComponent("MacroMate/cloud-cache", isDirectory: true))
    }

    static var hasOnboarded: Bool {
        get { UserDefaults.standard.bool(forKey: onboardedKey) }
        set { UserDefaults.standard.set(newValue, forKey: onboardedKey) }
    }

    /// Pretty JSON of everything in `entries` + `profile` (ISO dates, same column names as the cloud).
    static func exportJSON(entries: [String: [FoodEntry]], profile: Profile) -> String {
        struct Export: Encodable { let exportedAt: Date; let profile: Profile; let logs: [String: [FoodEntry]] }
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        enc.dateEncodingStrategy = .iso8601
        let e = Export(exportedAt: Date(), profile: profile, logs: entries)
        return (try? enc.encode(e)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}
