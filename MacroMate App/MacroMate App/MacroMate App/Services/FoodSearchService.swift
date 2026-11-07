import Foundation

/// Bundled databases (OpenNutrition ~10k items, AFCD ~1.6k items), decoded once off the main actor.
actor FoodDatabase {
    static let shared = FoodDatabase()

    private struct Row { let item: FoodItem; let norm: String }
    private var openNutrition: [Row] = []
    private var afcd: [Row] = []
    private var loaded = false

    private nonisolated struct ONRaw: Decodable {
        let id: String, food_name: String
        let calories: Double?, protein_g: Double?, carbs_g: Double?, fat_g: Double?
        let fiber_g: Double?, sugar_g: Double?, sodium_mg: Double?
    }
    private nonisolated struct AFCDRaw: Decodable {
        let food_key: String, food_name: String
        let energy_kcal: Double?, protein_g: Double?, carbs_g: Double?, fat_g: Double?, fiber_g: Double?
        let per_amount: Double?
    }

    /// Loads both files once; later calls return immediately.
    func load() {
        guard !loaded else { return }
        loaded = true
        if let url = Bundle.main.url(forResource: "opennutrition_foods", withExtension: "json"),
           let data = try? Data(contentsOf: url, options: .mappedIfSafe),
           let raw = try? JSONDecoder().decode([ONRaw].self, from: data) {
            openNutrition = raw.map { r in
                Row(item: FoodItem(id: "on-\(r.id)", name: r.food_name, caloriesPer100g: r.calories ?? 0,
                                   proteinPer100g: r.protein_g ?? 0, carbsPer100g: r.carbs_g ?? 0, fatPer100g: r.fat_g ?? 0,
                                   fiberPer100g: r.fiber_g ?? 0, sugarPer100g: r.sugar_g ?? 0, sodiumMgPer100g: r.sodium_mg ?? 0,
                                   source: .opennutrition),
                    norm: QuantityExtraction.normalizeFoodName(r.food_name))
            }
        }
        if let url = Bundle.main.url(forResource: "afcd_foods", withExtension: "json"),
           let data = try? Data(contentsOf: url, options: .mappedIfSafe),
           let raw = try? JSONDecoder().decode([AFCDRaw].self, from: data) {
            afcd = raw.map { r in
                let f = (r.per_amount ?? 100) > 0 ? 100 / (r.per_amount ?? 100) : 1
                return Row(item: FoodItem(id: "afcd-\(r.food_key)", name: r.food_name, caloriesPer100g: (r.energy_kcal ?? 0) * f,
                                          proteinPer100g: (r.protein_g ?? 0) * f, carbsPer100g: (r.carbs_g ?? 0) * f,
                                          fatPer100g: (r.fat_g ?? 0) * f, fiberPer100g: (r.fiber_g ?? 0) * f, source: .afcd),
                           norm: QuantityExtraction.normalizeFoodName(r.food_name))
            }
        }
    }

    func search(_ query: String, afcdEnabled: Bool, limit: Int) -> (afcd: [FoodItem], openNutrition: [FoodItem]) {
        load()
        let q = QuantityExtraction.normalizeFoodName(query)
        let tokens = q.split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return ([], []) }
        return (afcdEnabled ? Self.rank(afcd, q, tokens, limit) : [], Self.rank(openNutrition, q, tokens, limit))
    }

    /// All tokens must appear; exact > prefix > word-start matches > contains, shorter names win ties.
    private static func rank(_ rows: [Row], _ q: String, _ tokens: [String], _ limit: Int) -> [FoodItem] {
        var scored: [(Int, FoodItem)] = []
        for r in rows {
            guard tokens.allSatisfy({ r.norm.contains($0) }) else { continue }
            var s = 0
            if r.norm == q { s += 1000 } else if r.norm.hasPrefix(q) { s += 600 }
            for t in tokens where r.norm.hasPrefix(t + " ") || r.norm.contains(" " + t) { s += 40 }
            s -= r.norm.count / 3
            scored.append((s, r.item))
        }
        scored.sort { $0.0 > $1.0 }
        return scored.prefix(limit).map(\.1)
    }
}

/// Tiered food search: history, saved foods, AFCD (AU), OpenNutrition (bundled), then Open Food Facts
/// (online, explicit submit only). Local tiers are cheap and run as you type (debounced); the online
/// tier never runs automatically.
@MainActor
final class FoodSearchService {
    let off = OpenFoodFactsService()

    /// Starts loading the bundled databases in the background (call at launch).
    func warmUp() { Task.detached(priority: .utility) { await FoodDatabase.shared.load() } }

    /// Foods derived from logged entries: newest first, with the last quantity as the serving.
    static func historyItems(from entries: [String: [FoodEntry]]) -> [FoodItem] {
        var best: [String: (entry: FoodEntry, count: Int)] = [:]
        for e in entries.values.joined() where e.quantityG > 0 {
            let key = QuantityExtraction.normalizeFoodName(e.name)
            if let cur = best[key] {
                best[key] = (e.loggedAt > cur.entry.loggedAt ? e : cur.entry, cur.count + 1)
            } else { best[key] = (e, 1) }
        }
        return best.values.sorted { ($0.entry.loggedAt, $0.count) > ($1.entry.loggedAt, $1.count) }.map { b in
            let e = b.entry, f = 100 / e.quantityG
            return FoodItem(id: "hist-\(QuantityExtraction.normalizeFoodName(e.name))", name: e.name,
                            caloriesPer100g: Double(e.calories) * f, proteinPer100g: e.proteinG * f,
                            carbsPer100g: e.carbsG * f, fatPer100g: e.fatG * f, servingSizeG: e.quantityG,
                            servingSizeDisplay: "Last: \(QuantityExtraction.formatQuantity(e.quantityG))",
                            source: .history, lastLogged: e.loggedAt)
        }
    }

    /// Local tiers merged in priority order and de-duplicated by name. Returns [] if cancelled during
    /// the debounce, so call it from `.task(id: query)`.
    func localSearch(_ query: String, history: [FoodItem], saved: [SavedFood], country: String?,
                     debounce: Duration = .milliseconds(200), limit: Int = 30) async -> [FoodItem] {
        let q = QuantityExtraction.normalizeFoodName(QuantityExtraction.extract(query).foodName)
        guard q.count >= 2 else { return [] }
        if debounce > .zero { try? await Task.sleep(for: debounce) }
        if Task.isCancelled { return [] }

        let tokens = q.split(separator: " ").map(String.init)
        func matches(_ name: String) -> Bool {
            let n = QuantityExtraction.normalizeFoodName(name)
            return tokens.allSatisfy { n.contains($0) }
        }
        let hist = history.filter { matches($0.name) }.prefix(6)
        let savd = saved.sorted { ($0.usageCount, $0.lastUsed) > ($1.usageCount, $1.lastUsed) }
            .map(\.item).filter { matches($0.name) }.prefix(6)
        let db = await FoodDatabase.shared.search(q, afcdEnabled: CountryConfig.config(for: country).hasAFCD, limit: limit)
        if Task.isCancelled { return [] }

        var seen = Set<String>(), out: [FoodItem] = []
        for item in Array(hist) + Array(savd) + db.afcd + db.openNutrition {
            if seen.insert(QuantityExtraction.normalizeFoodName(item.name)).inserted { out.append(item) }
            if out.count >= limit { break }
        }
        return out
    }

    /// Open Food Facts text search (explicit "Search online" only).
    func onlineSearch(_ query: String) async -> [FoodItem] {
        await off.search(QuantityExtraction.extract(query).foodName)
    }

    func barcode(_ code: String) async -> FoodItem? { await off.product(barcode: code) }

    /// Resolves a meal-photo item: best local match, else an AI estimate (if any AI backend is available).
    /// Returns the food and the grams to log.
    func resolve(_ photoItem: GeminiService.MealPhotoItem, history: [FoodItem], saved: [SavedFood],
                 country: String?, ai: FoodAI) async -> (food: FoodItem, grams: Double)? {
        let grams = photoItem.grams
        if let hit = await localSearch(photoItem.name, history: history, saved: saved, country: country,
                                       debounce: .zero, limit: 1).first {
            return (hit, grams)
        }
        guard ai.isAvailable else { return nil }
        let desc = "\(Int(photoItem.quantity.rounded())) \(photoItem.unit) \(photoItem.name)"
        guard let est = try? await ai.analyzeFood(desc) else { return nil }
        return (est.foodItem, est.quantityG > 0 ? est.quantityG : grams)
    }
}
