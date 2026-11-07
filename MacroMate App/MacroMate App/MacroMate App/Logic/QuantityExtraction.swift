import Foundation

/// Port of src/services/quantityExtraction.js: "200g chicken", "2 eggs", "1 cup rice" -> grams + food name.
nonisolated enum QuantityExtraction {
    struct Result: Equatable, Sendable {
        var quantity: Double
        var unit: String
        var foodName: String
        var quantityGrams: Double
    }

    /// Approximate grams per unit (volume units assume water density).
    static let unitGrams: [String: Double] = [
        "g": 1, "gram": 1, "grams": 1, "kg": 1000, "kilogram": 1000, "kilograms": 1000,
        "oz": 28.35, "ounce": 28.35, "ounces": 28.35, "lb": 453.59, "lbs": 453.59, "pound": 453.59, "pounds": 453.59,
        "ml": 1, "milliliter": 1, "milliliters": 1, "l": 1000, "liter": 1000, "liters": 1000,
        "tsp": 5, "teaspoon": 5, "teaspoons": 5, "tbsp": 15, "tablespoon": 15, "tablespoons": 15,
        "cup": 240, "cups": 240,
        "piece": 100, "pieces": 100, "pcs": 100, "pc": 100, "slice": 30, "slices": 30,
        "serving": 100, "servings": 100, "egg": 50, "eggs": 50, "each": 100,
        "bowl": 250, "bowls": 250, "plate": 350, "plates": 350, "glass": 250, "glasses": 250,
        "can": 330, "cans": 330, "bottle": 500, "bottles": 500, "tub": 150, "tubs": 150,
        "packet": 100, "packets": 100, "pack": 100, "packs": 100, "handful": 30, "handfuls": 30,
        "scoop": 30, "scoops": 30, "bar": 50, "bars": 50, "stick": 15, "sticks": 15,
        "clove": 5, "cloves": 5, "pinch": 1, "pinches": 1, "dash": 1, "dashes": 1,
    ]

    /// Unknown unit word: treat as one generic serving rather than 1 g.
    static let unknownUnitGrams = 100.0

    private static let knownUnitPatterns = [
        #"^(\d+\.?\d*)\s*(g|gram|grams|kg|kilogram|kilograms)\s+(.+)$"#,
        #"^(\d+\.?\d*)\s*(oz|ounce|ounces|lb|lbs|pound|pounds)\s+(.+)$"#,
        #"^(\d+\.?\d*)\s*(ml|milliliter|milliliters|l|liter|liters)\s+(.+)$"#,
        #"^(\d+\.?\d*)\s*(tsp|teaspoon|teaspoons|tbsp|tablespoon|tablespoons)\s+(.+)$"#,
        #"^(\d+\.?\d*)\s*(cup|cups)\s+(.+)$"#,
        #"^(\d+\.?\d*)\s*(piece|pieces|pcs|pc|slice|slices|serving|servings)\s+(.+)$"#,
    ]

    /// Capture groups (1...) of the first case-insensitive match, or nil.
    private static func captures(_ pattern: String, in text: String) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns = text as NSString
        guard let m = re.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (1..<m.numberOfRanges).map { m.range(at: $0).location == NSNotFound ? "" : ns.substring(with: m.range(at: $0)) }
    }

    /// Splits user input into quantity + food name. No quantity found -> 100 g of the whole text.
    static func extract(_ input: String) -> Result {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return Result(quantity: 100, unit: "g", foodName: input, quantityGrams: 100) }

        // 1. "50g chicken breast" with a known unit.
        for pattern in knownUnitPatterns {
            if let m = captures(pattern, in: trimmed), let q = Double(m[0]) {
                let unit = m[1].lowercased()
                return Result(quantity: q, unit: unit, foodName: m[2].trimmingCharacters(in: .whitespaces),
                              quantityGrams: convertToGrams(q, unit: unit))
            }
        }

        // 2. Number then food, no unit: "2 eggs", "3 apples".
        if let m = captures(#"^(\d+\.?\d*)\s+(.+)$"#, in: trimmed), let q = Double(m[0]) {
            let food = m[1].trimmingCharacters(in: .whitespaces)
            let lower = food.lowercased()
            let wordCount = lower.split(separator: " ").count
            var perPiece = 100.0
            if lower == "egg" || lower == "eggs" { perPiece = 50 }
            else if lower.contains("apple"), wordCount <= 2 { perPiece = 150 }
            else if lower.contains("banana"), wordCount <= 2 { perPiece = 120 }
            else if lower.contains("slice") { perPiece = 30 }
            return Result(quantity: q, unit: "piece", foodName: food, quantityGrams: q * perPiece)
        }

        // 3. Quantity at the end: "chicken breast 50g".
        if let m = captures(#"^(.+?)\s+(\d+\.?\d*)\s*([a-zA-Z]+)$"#, in: trimmed), let q = Double(m[1]) {
            let unit = m[2].lowercased()
            return Result(quantity: q, unit: unit, foodName: m[0].trimmingCharacters(in: .whitespaces),
                          quantityGrams: convertToGrams(q, unit: unit))
        }

        // 4. No quantity: default 100 g.
        return Result(quantity: 100, unit: "g", foodName: trimmed, quantityGrams: 100)
    }

    static func convertToGrams(_ quantity: Double, unit: String) -> Double {
        quantity * (unitGrams[unit.lowercased()] ?? unknownUnitGrams)
    }

    /// Gemini meal-photo items use a fixed unit set: g, ml, cup, tbsp, tsp, piece, slice.
    static func grams(quantity: Double, unit: String) -> Double { convertToGrams(quantity, unit: unit) }

    /// "50g" / "1 cup" -> grams (100 if unparseable).
    static func parseAIQuantity(_ s: String) -> Double {
        guard let m = captures(#"(\d+\.?\d*)\s*([a-zA-Z]+)"#, in: s), let q = Double(m[0]) else { return 100 }
        return convertToGrams(q, unit: m[1])
    }

    /// "50g" / "1.5kg"
    static func formatQuantity(_ grams: Double) -> String {
        grams >= 1000 ? String(format: "%.1fkg", grams / 1000) : "\(Int(grams.rounded()))g"
    }

    /// Lowercase, strip leading article and punctuation, collapse spaces.
    static func normalizeFoodName(_ name: String) -> String {
        var s = name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        for article in ["a ", "an ", "the "] where s.hasPrefix(article) { s.removeFirst(article.count); break }
        s = String(s.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == " " || $0 == "-" }
            .map(Character.init))
        return s.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    static func hasQuantity(_ input: String) -> Bool {
        captures(#"(\d+\.?\d*\s*[a-zA-Z]+)"#, in: input) != nil
    }
}
