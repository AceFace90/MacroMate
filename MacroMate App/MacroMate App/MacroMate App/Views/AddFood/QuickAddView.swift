import SwiftUI

/// Manual entry: name + kcal/P/C/F, logged as a single 100 g-style entry.
struct QuickAddView: View {
    let date: String
    let finish: () -> Void

    @Environment(AppStore.self) private var store
    @State private var meal: MealType
    @State private var name: String
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""

    init(date: String, meal: MealType, initialName: String = "", finish: @escaping () -> Void) {
        self.date = date
        self.finish = finish
        _meal = State(initialValue: meal)
        _name = State(initialValue: initialName)
    }

    private func num(_ s: String) -> Double { Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var canLog: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && num(kcal) > 0 }

    var body: some View {
        Form {
            Section("Food") {
                TextField("Name", text: $name)
                Picker("Meal", selection: $meal) {
                    ForEach(MealType.allCases) { Text($0.title).tag($0) }
                }
            }
            Section("Nutrition (total)") {
                field("Calories", unit: "kcal", text: $kcal)
                field("Protein", unit: "g", text: $protein)
                field("Carbs", unit: "g", text: $carbs)
                field("Fat", unit: "g", text: $fat)
            }
        }
        .navigationTitle("Quick Add")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            Button {
                let entry = FoodEntry(name: name.trimmingCharacters(in: .whitespaces),
                                      calories: Int(num(kcal).rounded()), proteinG: num(protein),
                                      carbsG: num(carbs), fatG: num(fat), quantityG: 100,
                                      source: FoodSource.manual.rawValue, mealType: meal)
                store.addEntry(entry, on: date)
                finish()
            } label: {
                Text("Log \(meal.title)").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(!canLog)
            .padding(.horizontal, MacroMetrics.pagePadding)
            .padding(.bottom, 8)
        }
    }

    private func field(_ title: String, unit: String, text: Binding<String>) -> some View {
        HStack {
            Text(title)
            Spacer()
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 100)
            Text(unit).foregroundStyle(.secondary).frame(width: 34, alignment: .leading)
        }
    }
}

#Preview {
    NavigationStack { QuickAddView(date: DateUtils.todayStr(), meal: .lunch, finish: {}) }
        .environment(AppStore.preview)
}
