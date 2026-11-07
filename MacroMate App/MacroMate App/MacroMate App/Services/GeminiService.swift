import Foundation

/// Gemini REST client (port of src/services/gemini.js). The user's own API key is passed per call
/// (stored in Keychain, never synced).
nonisolated struct GeminiService: Sendable {
    static let model = "gemini-2.5-flash-lite"
    private static let parseMessage = "Couldn't read the AI response. Please try again."

    enum GeminiError: LocalizedError {
        case missingKey, api(String), parse
        var errorDescription: String? {
            switch self {
            case .missingKey: "Add your Gemini API key in Settings to use AI features."
            case .api(let m): m
            case .parse: GeminiService.parseMessage
            }
        }
    }

    /// Text estimate for one food. Values are for `quantityG`, not per 100 g.
    struct FoodEstimate: Sendable, Equatable {
        var name: String
        var calories: Double, proteinG: Double, carbsG: Double, fatG: Double, fiberG: Double
        var quantityG: Double
        var confidence: Double?

        /// Per-100g FoodItem so the quantity picker can rescale it.
        var foodItem: FoodItem {
            let f = quantityG > 0 ? 100 / quantityG : 1
            return FoodItem(id: "ai-\(UUID().uuidString)", name: name, caloriesPer100g: calories * f,
                            proteinPer100g: proteinG * f, carbsPer100g: carbsG * f, fatPer100g: fatG * f,
                            fiberPer100g: fiberG * f, servingSizeG: quantityG,
                            servingSizeDisplay: "\(Int(quantityG.rounded())) g", source: .gemini, isVerified: false)
        }
    }

    /// One item spotted in a meal photo.
    struct MealPhotoItem: Sendable, Equatable, Identifiable {
        var id = UUID()
        var name: String
        var quantity: Double
        var unit: String          // g, ml, cup, tbsp, tsp, piece, slice
        var grams: Double { QuantityExtraction.convertToGrams(quantity, unit: unit) }
    }

    /// Nutrition-label extraction. Values are per serving.
    struct LabelResult: Sendable, Equatable {
        var name: String
        var calories: Double, proteinG: Double, carbsG: Double, fatG: Double
        var fiberG: Double, sodiumMg: Double, sugarG: Double
        var servingSizeG: Double?
        var servingSizeDisplay: String?
        var confidence: Double?

        var foodItem: FoodItem {
            let s = (servingSizeG ?? 0) > 0 ? servingSizeG! : 100
            let f = 100 / s
            return FoodItem(id: "label-\(UUID().uuidString)", name: name, caloriesPer100g: calories * f,
                            proteinPer100g: proteinG * f, carbsPer100g: carbsG * f, fatPer100g: fatG * f,
                            fiberPer100g: fiberG * f, sugarPer100g: sugarG * f, sodiumMgPer100g: sodiumMg * f,
                            servingSizeG: servingSizeG, servingSizeDisplay: servingSizeDisplay,
                            source: .label, isVerified: false)
        }
    }

    // MARK: Public API

    func analyzeFood(_ text: String, key: String, context: String = "") async throws -> FoodEstimate {
        let prompt = """
        You are a nutrition database. Estimate the nutritional content of this food.
        \(context)

        Food: "\(text)"

        Respond with ONLY valid JSON:
        {
          "name": "food name",
          "calories": 250,
          "protein_g": 30,
          "carbs_g": 5,
          "fat_g": 12,
          "fiber_g": 0,
          "quantity_g": 100,
          "quantity_detected": "100g",
          "confidence_score": 85,
          "is_verified": false,
          "source": "ai"
        }

        Rules:
        - Values are for the quantity described (not per 100g)
        - confidence_score: 0-100 (lower if uncertain)
        - Return ONLY the JSON object
        """
        let obj = try await generate(prompt: prompt, imageJPEG: nil, key: key)
        guard let name = str(obj["name"]), let cal = num(obj["calories"]) else { throw GeminiError.parse }
        return FoodEstimate(name: name, calories: cal, proteinG: num(obj["protein_g"]) ?? 0,
                            carbsG: num(obj["carbs_g"]) ?? 0, fatG: num(obj["fat_g"]) ?? 0,
                            fiberG: num(obj["fiber_g"]) ?? 0, quantityG: num(obj["quantity_g"]) ?? 100,
                            confidence: num(obj["confidence_score"]))
    }

    func analyzeMealPhoto(_ jpeg: Data, key: String) async throws -> [MealPhotoItem] {
        let prompt = """
        You are a nutrition assistant. The image shows a meal or plate of food. Identify all visible food items and estimate realistic portion sizes.

        Respond with ONLY valid JSON in this exact shape:
        {
          "items": [
            { "name": "chicken breast grilled", "quantity": 150, "unit": "g" },
            { "name": "rice white cooked", "quantity": 200, "unit": "g" }
          ]
        }

        Rules:
        - Use generic food names (not brand names)
        - Estimate realistic portions based on visual size
        - unit must be one of: g, ml, cup, tbsp, tsp, piece, slice
        - Return ONLY the JSON object, no markdown, no explanation
        """
        let obj = try await generate(prompt: prompt, imageJPEG: jpeg, key: key)
        guard let raw = obj["items"] as? [Any] else { throw GeminiError.parse }
        let units = ["g", "ml", "cup", "tbsp", "tsp", "piece", "slice"]
        let items: [MealPhotoItem] = raw.compactMap { any in
            guard let d = any as? [String: Any], let name = str(d["name"]), let q = num(d["quantity"]) else { return nil }
            let u = (d["unit"] as? String).flatMap { units.contains($0) ? $0 : nil } ?? "g"
            return MealPhotoItem(name: name, quantity: q, unit: u)
        }
        guard !items.isEmpty else { throw GeminiError.parse }
        return items
    }

    func analyzeLabel(_ jpeg: Data, key: String) async throws -> LabelResult {
        let prompt = """
        You are a nutrition label reader. The image shows a food nutrition label.
        Extract the nutrition information and return ONLY valid JSON:
        {
          "name": "product name or description",
          "serving_size_display": "1 cup (240ml)",
          "serving_size_g": 240,
          "calories": 150,
          "protein_g": 5,
          "carbs_g": 20,
          "fat_g": 6,
          "fiber_g": 2,
          "sodium_mg": 300,
          "sugar_g": 8,
          "confidence_score": 90
        }

        Rules:
        - Values must be PER SERVING (the serving size shown on the label)
        - serving_size_g: convert to grams/ml if given in other units (1 cup ~ 240, 1 oz ~ 28)
        - confidence_score: 0-100 based on label clarity
        - If a nutrient is not shown, use 0
        - Return ONLY the JSON, no markdown
        """
        let obj = try await generate(prompt: prompt, imageJPEG: jpeg, key: key)
        guard let cal = num(obj["calories"]) else { throw GeminiError.parse }
        return LabelResult(name: str(obj["name"]) ?? "Scanned item", calories: cal,
                           proteinG: num(obj["protein_g"]) ?? 0, carbsG: num(obj["carbs_g"]) ?? 0,
                           fatG: num(obj["fat_g"]) ?? 0, fiberG: num(obj["fiber_g"]) ?? 0,
                           sodiumMg: num(obj["sodium_mg"]) ?? 0, sugarG: num(obj["sugar_g"]) ?? 0,
                           servingSizeG: num(obj["serving_size_g"]).flatMap { $0 > 0 ? $0 : nil },
                           servingSizeDisplay: str(obj["serving_size_display"]),
                           confidence: num(obj["confidence_score"]))
    }

    // MARK: Transport + defensive parsing

    private func generate(prompt: String, imageJPEG: Data?, key: String) async throws -> [String: Any] {
        guard !key.trimmingCharacters(in: .whitespaces).isEmpty else { throw GeminiError.missingKey }
        var parts: [[String: Any]] = []
        if let imageJPEG { parts.append(["inlineData": ["mimeType": "image/jpeg", "data": imageJPEG.base64EncodedString()]]) }
        parts.append(["text": prompt])
        let body: [String: Any] = ["contents": [["parts": parts]],
                                   "generationConfig": ["temperature": 0.1, "maxOutputTokens": 512]]
        var req = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(Self.model):generateContent")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "x-goog-api-key")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 45

        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let msg = ((json?["error"] as? [String: Any])?["message"] as? String) ?? "Gemini API error \(http.statusCode)"
            throw GeminiError.api(msg)
        }
        let text = (((json?["candidates"] as? [[String: Any]])?.first?["content"] as? [String: Any])?["parts"] as? [[String: Any]])?
            .first?["text"] as? String
        return try Self.parseJSON(text)
    }

    /// Strips markdown fences and parses a JSON object (Gemini sometimes wraps or truncates).
    static func parseJSON(_ raw: String?) throws -> [String: Any] {
        let clean = (raw ?? "").replacingOccurrences(of: "```json", with: "").replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let data = clean.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw GeminiError.parse }
        return obj
    }

    /// Finite number from a JSON number or numeric string.
    private func num(_ v: Any?) -> Double? {
        if let n = v as? NSNumber, !(v is Bool) { return n.doubleValue.isFinite ? n.doubleValue : nil }
        if let s = v as? String, let d = Double(s.trimmingCharacters(in: .whitespaces)), d.isFinite { return d }
        return nil
    }
    private func str(_ v: Any?) -> String? {
        guard let s = (v as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        return s
    }
}
