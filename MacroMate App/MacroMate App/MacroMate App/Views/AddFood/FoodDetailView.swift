import SwiftUI

/// Pushed detail: quantity entry with chips, live macro preview, Log button.
struct FoodDetailView: View {
    let item: FoodItem
    let date: String
    let finish: () -> Void

    @Environment(AppStore.self) private var store
    @State private var meal: MealType
    @State private var quantityText: String

    init(item: FoodItem, date: String, meal: MealType, finish: @escaping () -> Void) {
        self.item = item
        self.date = date
        self.finish = finish
        _meal = State(initialValue: meal)
        _quantityText = State(initialValue: Self.format(item.defaultQuantityG))
    }

    private static func format(_ g: Double) -> String {
        g == g.rounded() ? String(Int(g)) : String(format: "%.1f", g)
    }

    private var grams: Double {
        Double(quantityText.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)) ?? 0
    }
    private var preview: MacroTotals { item.nutrition(forGrams: grams) }

    private struct Chip: Identifiable { let label: String; let grams: Double; var id: String { label } }
    private var chips: [Chip] {
        var out = [Chip(label: "100 g", grams: 100)]
        if let s = item.servingSizeG, s > 0 {
            let name = item.servingSizeDisplay ?? QuantityExtraction.formatQuantity(s)
            out += [Chip(label: "1 serving (\(name))", grams: s),
                    Chip(label: "\u{00BD} serving", grams: s / 2),
                    Chip(label: "2 servings", grams: s * 2)]
        }
        return out
    }

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.name).font(.title2.weight(.bold))
                    if let brand = item.brand, !item.name.localizedCaseInsensitiveContains(brand) {
                        Text(brand).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 8) {
                        Text(item.source.title)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(MacroColor.calories.opacity(0.15), in: .capsule)
                            .foregroundStyle(MacroColor.calories)
                        if !item.isVerified {
                            Text("Estimate").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Quantity") {
                HStack {
                    TextField("Amount", text: $quantityText)
                        .keyboardType(.decimalPad)
                        .font(.title3.weight(.semibold))
                    Text("g").foregroundStyle(.secondary)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(chips) { chip in
                            Button(chip.label) { quantityText = Self.format(chip.grams) }
                                .buttonStyle(.bordered)
                                .buttonBorderShape(.capsule)
                                .controlSize(.small)
                        }
                    }
                }
            }

            Section("Nutrition") {
                HStack {
                    stat("kcal", Int(preview.calories.rounded()).formatted(), MacroColor.calories)
                    stat("Protein", gramsLabel(preview.protein), MacroColor.protein)
                    stat("Carbs", gramsLabel(preview.carbs), MacroColor.carbs)
                    stat("Fat", gramsLabel(preview.fat), MacroColor.fat)
                }
            }

            Section("Meal") {
                Picker("Meal", selection: $meal) {
                    ForEach(MealType.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                }
            }
        }
        .navigationTitle("Food")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            Button {
                AddFoodLogger.log(item, grams: grams, meal: meal, on: date, store: store)
                finish()
            } label: {
                Text("Log \(meal.title)").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(grams <= 0)
            .padding(.horizontal, MacroMetrics.pagePadding)
            .padding(.bottom, 8)
        }
    }

    private func gramsLabel(_ v: Double) -> String { "\(MacroTotals.round1(v).formatted())g" }

    private func stat(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.weight(.bold)).foregroundStyle(color)
                .minimumScaleFactor(0.7).lineLimit(1)
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    NavigationStack {
        FoodDetailView(
            item: FoodItem(id: "p", name: "Greek yoghurt", caloriesPer100g: 97, proteinPer100g: 9,
                           carbsPer100g: 4, fatPer100g: 5, servingSizeG: 170, servingSizeDisplay: "170 g pot",
                           source: .opennutrition),
            date: DateUtils.todayStr(), meal: .breakfast, finish: {})
    }
    .environment(AppStore.preview)
}
