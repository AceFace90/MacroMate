import SwiftUI

/// Edit a logged entry. Changing quantity rescales macros from the original per-gram values;
/// macros can then be overridden manually.
struct EntryEditSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let original: FoodEntry
    let date: String

    @State private var name: String
    @State private var meal: MealType
    @State private var qty: String
    @State private var kcal: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String

    init(entry: FoodEntry, date: String) {
        original = entry
        self.date = date
        _name = State(initialValue: entry.name)
        _meal = State(initialValue: entry.mealType)
        _qty = State(initialValue: TodayFormat.g(entry.quantityG))
        _kcal = State(initialValue: String(entry.calories))
        _protein = State(initialValue: TodayFormat.g(entry.proteinG))
        _carbs = State(initialValue: TodayFormat.g(entry.carbsG))
        _fat = State(initialValue: TodayFormat.g(entry.fatG))
    }

    private func num(_ s: String) -> Double { Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }

    private func rescale(_ newQty: String) {
        let q = num(newQty)
        let base = original.quantityG > 0 ? original.quantityG : 100
        guard q > 0 else { return }
        let f = q / base
        kcal = String(Int((Double(original.calories) * f).rounded()))
        protein = TodayFormat.g(MacroTotals.round1(original.proteinG * f))
        carbs = TodayFormat.g(MacroTotals.round1(original.carbsG * f))
        fat = TodayFormat.g(MacroTotals.round1(original.fatG * f))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Food") {
                    TextField("Name", text: $name)
                    Picker("Meal", selection: $meal) {
                        ForEach(MealType.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                    }
                }
                Section {
                    field("Quantity", "g", $qty)
                        .onChange(of: qty) { _, new in rescale(new) }
                } footer: {
                    Text("Changing the quantity rescales the macros below. You can still adjust them by hand.")
                }
                Section("Nutrition") {
                    field("Calories", "kcal", $kcal, color: MacroColor.calories)
                    field("Protein", "g", $protein, color: MacroColor.protein)
                    field("Carbs", "g", $carbs, color: MacroColor.carbs)
                    field("Fat", "g", $fat, color: MacroColor.fat)
                }
                Section {
                    Button("Delete Entry", role: .destructive) {
                        store.removeEntry(id: original.id, on: date)
                        dismiss()
                    }
                }
            }
            .navigationTitle("Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func field(_ label: String, _ unit: String, _ text: Binding<String>, color: Color = .primary) -> some View {
        HStack {
            Text(label).foregroundStyle(color == .primary ? .primary : color)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 100)
            Text(unit).foregroundStyle(.secondary).frame(width: 34, alignment: .leading)
        }
    }

    private func save() {
        var e = original
        e.name = name.trimmingCharacters(in: .whitespaces)
        e.mealType = meal
        let q = num(qty)
        e.quantityG = q > 0 ? q : original.quantityG
        e.calories = Int(num(kcal).rounded())
        e.proteinG = MacroTotals.round1(num(protein))
        e.carbsG = MacroTotals.round1(num(carbs))
        e.fatG = MacroTotals.round1(num(fat))
        store.updateEntry(e, on: date)
        dismiss()
    }
}

#Preview {
    let store = AppStore.preview
    EntryEditSheet(entry: store.entries(for: DateUtils.todayStr())[0], date: DateUtils.todayStr())
        .environment(store)
}
