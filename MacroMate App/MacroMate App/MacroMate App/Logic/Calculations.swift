import Foundation

/// Port of src/services/calculations.js. `computeGoalTargets` is the single source of truth for
/// targets: the rings, progress bars and the Profile "Current Goals" card must all call it.
nonisolated enum Calculations {
    /// JS `Math.round` (halves round up).
    private static func jsRound(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

    /// Mifflin-St Jeor BMR. OTHER uses the male/female average (-78). Nil if any input is missing/zero.
    static func calculateBMR(weightKg: Double?, heightCm: Double?, age: Int?, gender: Gender) -> Int? {
        guard let weightKg, weightKg > 0, let heightCm, heightCm > 0, let age, age > 0 else { return nil }
        let base = 10 * weightKg + 6.25 * heightCm - 5 * Double(age)
        switch gender {
        case .male: return jsRound(base + 5)
        case .female: return jsRound(base - 161)
        case .other: return jsRound(base - 78)
        }
    }

    static func calculateTDEE(bmr: Int?, activity: ActivityLevel) -> Int? {
        guard let bmr, bmr != 0 else { return nil }
        return jsRound(Double(bmr) * activity.multiplier)
    }

    /// Age in whole years from a "YYYY-MM-DD" date of birth (local calendar).
    static func calculateAge(dob: String?, on today: Date = Date()) -> Int? {
        guard let dob, let birth = DateUtils.date(from: dob) else { return nil }
        let cal = Calendar(identifier: .gregorian)
        return cal.dateComponents([.year], from: birth, to: today).year
    }

    /// 30/40/30 protein/carbs/fat split of `targetCalories`.
    static func calculateMacros(targetCalories: Int) -> (protein: Int, carbs: Int, fat: Int) {
        guard targetCalories > 0 else { return (0, 0, 0) }
        let c = Double(targetCalories)
        return (jsRound(c * 0.30 / 4), jsRound(c * 0.40 / 4), jsRound(c * 0.30 / 9))
    }

    /// Protein-first macros: protein = g/kg * weight, remaining kcal split carbs/fat by `split` ("60/40").
    static func calculateMacrosFromProtein(proteinPerKg: Double, weightKg: Double, targetCalories: Int,
                                           split: String = "60/40") -> (protein: Int, carbs: Int, fat: Int) {
        guard proteinPerKg > 0, weightKg > 0, targetCalories > 0 else { return (0, 0, 0) }
        let protein = jsRound(proteinPerKg * weightKg)
        let remaining = Double(targetCalories - protein * 4)
        let parts = split.split(separator: "/").compactMap { Double($0) }
        let carbsPct = parts.count > 0 ? parts[0] : 50
        let fatPct = parts.count > 1 ? parts[1] : 50
        return (protein, jsRound(remaining * (carbsPct / 100) / 4), jsRound(remaining * (fatPct / 100) / 9))
    }

    /// Daily targets from the saved profile (goal type, deficit/surplus, protein g/kg, carbs/fat split).
    /// Nil when weight/height/dob are missing, in which case callers fall back to `Targets.defaults`.
    static func computeGoalTargets(_ profile: Profile?, on today: Date = Date()) -> Targets? {
        guard let profile else { return nil }
        let age = calculateAge(dob: profile.dob, on: today)
        let activity = profile.activityLevel ?? .moderate
        guard let bmr = calculateBMR(weightKg: profile.weightKg, heightCm: profile.heightCm, age: age,
                                     gender: profile.gender ?? .male),
              let tdee = calculateTDEE(bmr: bmr, activity: activity) else { return nil }

        let goal = profile.goalType ?? .maintenance
        let proteinPerKg = (profile.proteinPerKg ?? 0) > 0 ? profile.proteinPerKg! : 2.0
        let split = profile.carbsFatSplit ?? "50/50"

        // calorie_deficit holds the magnitude for BOTH deficit and surplus goals.
        var adjustment = 0
        switch goal {
        case .weightLoss: adjustment = -(profile.calorieDeficit ?? 500)
        case .muscleGain: adjustment = profile.calorieDeficit ?? 200
        case .maintenance: break
        }
        let calories = max(0, tdee + adjustment)

        let macros: (protein: Int, carbs: Int, fat: Int)
        if let w = profile.weightKg, w > 0 {
            macros = calculateMacrosFromProtein(proteinPerKg: proteinPerKg, weightKg: w,
                                                targetCalories: calories, split: split)
        } else {
            macros = calculateMacros(targetCalories: calories)
        }
        return Targets(calories: calories, protein: macros.protein, carbs: macros.carbs,
                       fat: macros.fat, tdee: tdee, bmr: bmr)
    }

    /// Sum of entries (web `sumEntries`).
    static func sum(_ entries: [FoodEntry]) -> MacroTotals {
        entries.reduce(.zero) { $0 + $1.totals }
    }
}
