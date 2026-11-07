import Foundation

/// Open Food Facts API (port of src/services/openFoodFactsAPI.js): text search and barcode lookup.
/// Results are normalised to per-100g `FoodItem`s with the parsed serving size.
actor OpenFoodFactsService {
    private let base = "https://world.openfoodfacts.org"
    private let userAgent = "MacroMate/1.0 (iOS)"
    /// OFF allows ~10 searches/min; space explicit searches out.
    private let minSearchInterval: TimeInterval = 3
    private var lastSearch = Date.distantPast

    func search(_ query: String, limit: Int = 8) async -> [FoodItem] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else { return [] }
        let wait = minSearchInterval - Date().timeIntervalSince(lastSearch)
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        if Task.isCancelled { return [] }
        lastSearch = Date()

        var comps = URLComponents(string: "\(base)/cgi/search.pl")!
        comps.queryItems = [
            .init(name: "action", value: "process"), .init(name: "search_terms", value: q),
            .init(name: "search_simple", value: "1"), .init(name: "json", value: "1"),
            .init(name: "page_size", value: String(limit * 2)),
            .init(name: "fields", value: "product_name,product_name_en,brands,code,nutriments,serving_size,serving_quantity,serving_quantity_unit"),
        ]
        guard let url = comps.url, let json = await fetchJSON(url), let products = json["products"] as? [[String: Any]] else { return [] }
        return Array(products.compactMap { OpenFoodFactsService.item(from: $0) }.prefix(limit))
    }

    func product(barcode: String) async -> FoodItem? {
        let code = barcode.filter(\.isNumber)
        guard code.count >= 8, let url = URL(string: "\(base)/api/v2/product/\(code).json"),
              let json = await fetchJSON(url), (json["status"] as? Int) != 0,
              let product = json["product"] as? [String: Any] else { return nil }
        var p = product
        if p["code"] == nil { p["code"] = code }
        return Self.item(from: p, barcode: true)
    }

    private func fetchJSON(_ url: URL) async -> [String: Any]? {
        var req = URLRequest(url: url)
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        req.timeoutInterval = 20
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    // MARK: Parsing

    private static func number(_ v: Any?) -> Double? {
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) }
        return nil
    }

    /// Serving size from OFF: prefers serving_quantity + unit (avoids "1 portion (375 ml)" -> 1375),
    /// then "(X g)" / plain "X g". Nil when the product states no usable serving.
    static func parseServing(_ p: [String: Any]) -> (grams: Double, display: String?)? {
        let raw = (p["serving_size"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
        let unit = ((p["serving_quantity_unit"] as? String) ?? "").lowercased()
        func scaled(_ n: Double, _ u: String) -> Double {
            switch u { case "l", "litre", "liter", "kg": n * 1000; case "cl": n * 10; default: n }
        }
        if let q = number(p["serving_quantity"]), q > 0, !unit.isEmpty {
            let g = scaled(q, unit)
            return (g, raw.isEmpty ? "\(Int(g.rounded())) \(["l", "litre", "liter", "cl", "ml"].contains(unit) ? "ml" : "g")" : raw)
        }
        for pattern in [#"\(\s*([\d.]+)\s*(g|ml|l|cl)\s*\)"#, #"^([\d.]+)\s*(g|ml|l|cl)\s*$"#] {
            if let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
               let m = re.firstMatch(in: raw, range: NSRange(raw.startIndex..., in: raw)),
               let n = Double((raw as NSString).substring(with: m.range(at: 1))), n > 0 {
                return (scaled(n, (raw as NSString).substring(with: m.range(at: 2)).lowercased()), raw)
            }
        }
        return nil
    }

    static func item(from p: [String: Any], barcode: Bool = false) -> FoodItem? {
        let n = (p["nutriments"] as? [String: Any]) ?? [:]
        // Some AU products only have *_prepared_* keys.
        func v(_ keys: String...) -> Double { keys.lazy.compactMap { number(n[$0]) }.first(where: { $0 != 0 }) ?? 0 }
        let kcal = v("energy-kcal_100g", "energy-kcal_prepared_100g")
            + (v("energy-kcal_100g", "energy-kcal_prepared_100g") == 0 ? v("energy_100g") / 4.184 : 0)
        let protein = v("proteins_100g", "proteins_prepared_100g")
        let carbs = v("carbohydrates_100g", "carbohydrates_prepared_100g")
        let fat = v("fat_100g", "fat_prepared_100g")
        guard kcal > 0 || protein > 0 || carbs > 0 || fat > 0 else { return nil }

        let name = ((p["product_name"] as? String) ?? (p["product_name_en"] as? String) ?? "")
            .trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }
        let brand = (p["brands"] as? String)?.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) }
        let display = brand.map { b in name.localizedCaseInsensitiveContains(b) ? name : "\(name) by \(b)" } ?? name
        let code = (p["code"] as? String) ?? (p["code"] as? NSNumber)?.stringValue
        let serving = parseServing(p)

        return FoodItem(
            id: "off-\(code ?? UUID().uuidString)", name: display, brand: brand, barcode: code,
            caloriesPer100g: kcal, proteinPer100g: protein, carbsPer100g: carbs, fatPer100g: fat,
            fiberPer100g: v("fiber_100g", "fiber_prepared_100g"), sugarPer100g: v("sugars_100g", "sugars_prepared_100g"),
            sodiumMgPer100g: v("sodium_100g", "sodium_prepared_100g") * 1000,
            servingSizeG: serving?.grams, servingSizeDisplay: serving?.display,
            source: barcode ? .barcode : .openFoodFacts)
    }
}
