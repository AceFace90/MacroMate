import SwiftUI

// Domain types. Everything here is a `nonisolated` value type so it can be used from
// actors / detached tasks (the project defaults to MainActor isolation).

// MARK: - Meals

/// food_logs.meal_type
nonisolated enum MealType: String, Codable, CaseIterable, Identifiable, Sendable {
    case breakfast = "BREAKFAST"
    case lunch = "LUNCH"
    case dinner = "DINNER"
    case snack = "SNACK"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snack: "Snack"
        }
    }
    var symbol: String {
        switch self {
        case .breakfast: "sunrise.fill"
        case .lunch: "sun.max.fill"
        case .dinner: "moon.stars.fill"
        case .snack: "carrot.fill"
        }
    }

    /// Sensible default for "now": used when adding food to today.
    static func suggested(at date: Date = Date()) -> MealType {
        switch Calendar.current.component(.hour, from: date) {
        case 4..<11: .breakfast
        case 11..<15: .lunch
        case 15..<17: .snack
        case 17..<22: .dinner
        default: .snack
        }
    }
}

// MARK: - Nutrition totals

/// Calories + macros. Used for daily totals, scaled nutrition and ring values.
nonisolated struct MacroTotals: Equatable, Sendable, Codable {
    var calories: Double = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0

    static let zero = MacroTotals()

    static func + (a: MacroTotals, b: MacroTotals) -> MacroTotals {
        MacroTotals(calories: a.calories + b.calories, protein: a.protein + b.protein,
                    carbs: a.carbs + b.carbs, fat: a.fat + b.fat)
    }

    /// Calories rounded to a whole number, macros to one decimal (the precision stored in food_logs).
    var rounded: MacroTotals {
        MacroTotals(calories: calories.rounded(), protein: Self.round1(protein),
                    carbs: Self.round1(carbs), fat: Self.round1(fat))
    }

    static func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
}

// MARK: - Food entry (one row of food_logs)

/// Where a food's nutrition came from. Raw values match the web app's `source` strings.
nonisolated enum FoodSource: String, Codable, CaseIterable, Sendable {
    case history, saved, afcd, opennutrition, gemini, label, barcode, manual
    case openFoodFacts = "openfoodfacts-api"

    var title: String {
        switch self {
        case .history: "Recent"
        case .saved: "Saved"
        case .afcd: "AFCD"
        case .opennutrition: "OpenNutrition"
        case .openFoodFacts: "Open Food Facts"
        case .gemini: "AI estimate"
        case .label: "Label scan"
        case .barcode: "Barcode"
        case .manual: "Manual"
        }
    }
}

/// A logged food. Codable to the `food_logs` snake_case columns (minus user_id / logged_date,
/// which `CloudStore.FoodLogRow` adds). `id` is a client-generated UUID string.
nonisolated struct FoodEntry: Identifiable, Equatable, Hashable, Sendable {
    var id: String = UUID().uuidString
    var name: String
    var calories: Int
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var quantityG: Double = 100
    /// A `FoodSource` raw value (kept as String so unknown values from other clients survive).
    var source: String = FoodSource.manual.rawValue
    var loggedAt: Date = Date()
    var mealType: MealType = .breakfast

    var totals: MacroTotals {
        MacroTotals(calories: Double(calories), protein: proteinG, carbs: carbsG, fat: fatG)
    }
    var foodSource: FoodSource { FoodSource(rawValue: source) ?? .manual }
}

nonisolated extension FoodEntry: Codable {
    enum CodingKeys: String, CodingKey {
        case id, name, calories, source
        case proteinG = "protein_g", carbsG = "carbs_g", fatG = "fat_g"
        case quantityG = "quantity_g", loggedAt = "logged_at", mealType = "meal_type"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        // calories is an int column, but tolerate a numeric (e.g. 250.0) from other writers.
        if let i = try? c.decode(Int.self, forKey: .calories) { calories = i }
        else { calories = Int(((try? c.decode(Double.self, forKey: .calories)) ?? 0).rounded()) }
        proteinG = (try? c.decodeIfPresent(Double.self, forKey: .proteinG)) ?? 0
        carbsG = (try? c.decodeIfPresent(Double.self, forKey: .carbsG)) ?? 0
        fatG = (try? c.decodeIfPresent(Double.self, forKey: .fatG)) ?? 0
        quantityG = (try? c.decodeIfPresent(Double.self, forKey: .quantityG)) ?? 100
        source = (try? c.decodeIfPresent(String.self, forKey: .source)) ?? FoodSource.manual.rawValue
        loggedAt = (try? c.decodeIfPresent(Date.self, forKey: .loggedAt)) ?? Date()
        mealType = (try? c.decodeIfPresent(MealType.self, forKey: .mealType)) ?? .breakfast
    }
}

// MARK: - Search result

/// A food from any search tier / barcode / AI. Nutrition is always stored **per 100 g** so the
/// quantity picker can scale it; `servingSizeG` is the packaged/usual serving when known.
nonisolated struct FoodItem: Identifiable, Codable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
    var brand: String?
    var barcode: String?
    var caloriesPer100g: Double
    var proteinPer100g: Double
    var carbsPer100g: Double
    var fatPer100g: Double
    var fiberPer100g: Double = 0
    var sugarPer100g: Double = 0
    var sodiumMgPer100g: Double = 0
    /// Serving size in grams (or ml, treated 1:1) if the source states one; nil = none known.
    var servingSizeG: Double?
    /// e.g. "1 cup (240ml)" or "Usual: 150 g".
    var servingSizeDisplay: String?
    var source: FoodSource
    var isVerified: Bool = true
    /// Set for history results (most recent log).
    var lastLogged: Date?

    /// Quantity to preselect in the picker: the serving size, else 100 g.
    var defaultQuantityG: Double { servingSizeG ?? 100 }

    /// Calories + macros for `grams` of this food (unrounded).
    func nutrition(forGrams grams: Double) -> MacroTotals {
        let f = grams / 100
        return MacroTotals(calories: caloriesPer100g * f, protein: proteinPer100g * f,
                           carbs: carbsPer100g * f, fat: fatPer100g * f)
    }

    /// Builds the entry to log for `grams` of this food (rounded like the web `addEntry`).
    func entry(grams: Double, mealType: MealType, loggedAt: Date = Date()) -> FoodEntry {
        let n = nutrition(forGrams: grams).rounded
        return FoodEntry(name: name, calories: Int(n.calories), proteinG: n.protein, carbsG: n.carbs,
                         fatG: n.fat, quantityG: grams, source: source.rawValue,
                         loggedAt: loggedAt, mealType: mealType)
    }
}

/// A food the user logged before (device-local "verified" cache; tier 2 of search).
nonisolated struct SavedFood: Codable, Equatable, Identifiable, Sendable {
    var item: FoodItem
    var usageCount: Int = 1
    var lastUsed: Date = Date()
    var id: String { item.id }
}

// MARK: - Profile (profiles table)

nonisolated enum Gender: String, Codable, CaseIterable, Identifiable, Sendable {
    case male = "MALE", female = "FEMALE", other = "OTHER"
    var id: String { rawValue }
    var title: String { switch self { case .male: "Male"; case .female: "Female"; case .other: "Other" } }
}

nonisolated enum ActivityLevel: String, Codable, CaseIterable, Identifiable, Sendable {
    case sedentary = "SEDENTARY", light = "LIGHT", moderate = "MODERATE", very = "VERY", extra = "EXTRA"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .sedentary: "Sedentary"
        case .light: "Lightly active"
        case .moderate: "Moderately active"
        case .very: "Very active"
        case .extra: "Extra active"
        }
    }
    var detail: String {
        switch self {
        case .sedentary: "Little or no exercise"
        case .light: "Exercise 1-3 days/week"
        case .moderate: "Exercise 3-5 days/week"
        case .very: "Hard exercise 6-7 days/week"
        case .extra: "Very hard exercise and a physical job"
        }
    }
    var multiplier: Double {
        switch self {
        case .sedentary: 1.2
        case .light: 1.375
        case .moderate: 1.55
        case .very: 1.725
        case .extra: 1.9
        }
    }
}

nonisolated enum GoalType: String, Codable, CaseIterable, Identifiable, Sendable {
    case weightLoss = "WEIGHT_LOSS", maintenance = "MAINTENANCE", muscleGain = "MUSCLE_GAIN"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .weightLoss: "Weight loss"
        case .maintenance: "Maintenance"
        case .muscleGain: "Muscle gain"
        }
    }
    /// Header used on the Current Goals card.
    var longTitle: String {
        switch self {
        case .weightLoss: "Weight Loss (Calorie Deficit)"
        case .maintenance: "Maintenance"
        case .muscleGain: "Muscle Gain (Calorie Surplus)"
        }
    }
}

/// One row of `profiles` (id = auth uid, not stored here). All fields optional like the table.
nonisolated struct Profile: Equatable, Sendable {
    var name: String?
    var weightKg: Double?
    var heightCm: Double?
    /// "YYYY-MM-DD"
    var dob: String?
    var gender: Gender?
    var activityLevel: ActivityLevel?
    /// Country code from `CountryConfig` ("AU" default).
    var country: String?
    var goalType: GoalType?
    /// Magnitude of the deficit (weight loss) or surplus (muscle gain), kcal.
    var calorieDeficit: Int?
    var proteinPerKg: Double?
    /// "carbs/fat" percent split of the non-protein calories, e.g. "50/50".
    var carbsFatSplit: String?

    static let empty = Profile()
    var isEmpty: Bool { self == .empty }
}

nonisolated extension Profile: Codable {
    enum CodingKeys: String, CodingKey {
        case name, dob, gender, country
        case weightKg = "weight_kg", heightCm = "height_cm", activityLevel = "activity_level"
        case goalType = "goal_type", calorieDeficit = "calorie_deficit"
        case proteinPerKg = "protein_per_kg", carbsFatSplit = "carbs_fat_split"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Every field is lenient: a bad/unknown value in one column must not drop the whole profile.
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        weightKg = try? c.decodeIfPresent(Double.self, forKey: .weightKg)
        heightCm = try? c.decodeIfPresent(Double.self, forKey: .heightCm)
        dob = try? c.decodeIfPresent(String.self, forKey: .dob)
        gender = try? c.decodeIfPresent(Gender.self, forKey: .gender)
        activityLevel = try? c.decodeIfPresent(ActivityLevel.self, forKey: .activityLevel)
        country = try? c.decodeIfPresent(String.self, forKey: .country)
        goalType = try? c.decodeIfPresent(GoalType.self, forKey: .goalType)
        calorieDeficit = try? c.decodeIfPresent(Int.self, forKey: .calorieDeficit)
        proteinPerKg = try? c.decodeIfPresent(Double.self, forKey: .proteinPerKg)
        carbsFatSplit = try? c.decodeIfPresent(String.self, forKey: .carbsFatSplit)
    }

    /// Encodes nil as explicit `null` so an upsert can clear a column.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(weightKg, forKey: .weightKg)
        try c.encode(heightCm, forKey: .heightCm)
        try c.encode(dob, forKey: .dob)
        try c.encode(gender, forKey: .gender)
        try c.encode(activityLevel, forKey: .activityLevel)
        try c.encode(country, forKey: .country)
        try c.encode(goalType, forKey: .goalType)
        try c.encode(calorieDeficit, forKey: .calorieDeficit)
        try c.encode(proteinPerKg, forKey: .proteinPerKg)
        try c.encode(carbsFatSplit, forKey: .carbsFatSplit)
    }
}

// MARK: - Targets

/// Daily calorie + macro targets (result of `Calculations.computeGoalTargets`).
nonisolated struct Targets: Equatable, Sendable {
    var calories: Int
    var protein: Int
    var carbs: Int
    var fat: Int
    /// Present only for computed (profile-derived) targets.
    var tdee: Int?
    var bmr: Int?

    /// Web `DEFAULT_TARGETS`.
    static let defaults = Targets(calories: 2000, protein: 150, carbs: 200, fat: 67)
}

// MARK: - Theme

nonisolated enum ThemePreference: String, Codable, CaseIterable, Identifiable, Sendable {
    case auto, light, dark
    var id: String { rawValue }
    var title: String { switch self { case .auto: "System"; case .light: "Light"; case .dark: "Dark" } }
    var colorScheme: ColorScheme? {
        switch self {
        case .light: .light
        case .dark: .dark
        case .auto: nil
        }
    }
}
