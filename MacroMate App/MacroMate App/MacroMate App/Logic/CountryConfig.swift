import Foundation

/// Port of src/services/countryConfig.js: which databases / brands to prioritise per country.
nonisolated struct CountryConfig: Identifiable, Sendable {
    let code: String
    let name: String
    let flag: String
    let hasAFCD: Bool
    let priorityBrands: [String]
    var id: String { code }
    var label: String { "\(flag) \(name)" }

    static let all: [CountryConfig] = [
        CountryConfig(code: "AU", name: "Australia", flag: "🇦🇺", hasAFCD: true, priorityBrands: [
            "aldi", "iga", "coles", "woolworths", "woolies", "arnott", "arnotts", "sanitarium", "vegemite",
            "weet-bix", "weetbix", "tim tam", "timtam", "shapes", "vita-weat", "up & go", "so good",
            "red rooster", "hungry jacks"]),
        CountryConfig(code: "US", name: "United States", flag: "🇺🇸", hasAFCD: false, priorityBrands: [
            "kraft", "heinz", "campbell", "progresso", "tyson", "perdue", "foster farms", "starbucks",
            "mcdonald", "mcdonalds", "subway", "burger king", "kfc", "pizza hut", "dominos", "chipotle",
            "panera", "olive garden"]),
        CountryConfig(code: "UK", name: "United Kingdom", flag: "🇬🇧", hasAFCD: false, priorityBrands: [
            "tesco", "sainsbury", "asda", "morrisons", "m&s", "marks & spencer", "waitrose",
            "mcdonald", "mcdonalds", "kfc", "subway"]),
        CountryConfig(code: "CA", name: "Canada", flag: "🇨🇦", hasAFCD: false, priorityBrands: [
            "loblaws", "sobeys", "metro", "walmart", "mcdonald", "mcdonalds", "tim hortons", "subway", "kfc"]),
        CountryConfig(code: "GLOBAL", name: "Other / Global", flag: "🌍", hasAFCD: false, priorityBrands: [
            "coca-cola", "pepsi", "nutella", "kellogg", "nestle", "doritos", "oreo", "starbucks"]),
    ]

    /// Unknown codes fall back to GLOBAL (like the web).
    static func config(for code: String?) -> CountryConfig {
        all.first { $0.code == code } ?? all[all.count - 1]
    }
}
