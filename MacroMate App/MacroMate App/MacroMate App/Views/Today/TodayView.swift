import SwiftUI

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var editing: FoodEntry?
    /// Meal chosen via a section "+". AppRouter/AddFoodView have no meal preselect yet.

    var body: some View {
        @Bindable var router = router
        let day = router.selectedDate
        let totals = store.totals(for: day)
        let targets = store.targets
        let hasEntries = !store.entries(for: day).isEmpty

        MacroPage {
            DayNavigator(day: $router.selectedDate)

            chipStrip(totals, targets)
                .padding(.horizontal, -MacroMetrics.pagePadding)

            VStack(alignment: .leading, spacing: 6) {
                Text(greetingLine).font(.subheadline).foregroundStyle(.secondary)
                Text(headline(totals, targets)).macroHeadline()
                Text(narrative(totals, targets, hasEntries)).macroNarrative()
            }

            MacroCard {
                MacroRings(totals: totals, targets: targets).frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }

            if !hasEntries {
                ContentUnavailableView {
                    Label("Nothing logged", systemImage: "fork.knife")
                } description: {
                    Text(DateUtils.isToday(day) ? "Log your first meal to see your day take shape." : "No food logged on this day.")
                } actions: {
                    Button("Add Food") { add(nil) }.buttonStyle(.glassProminent)
                }
            }

            ForEach(MealType.allCases) { meal in
                MealSectionCard(meal: meal, entries: store.entries(for: day, meal: meal),
                                onAdd: { add(meal) },
                                onEdit: { editing = $0 },
                                onDelete: { store.removeEntry(id: $0.id, on: day) })
            }

            NavigationLink { FoodHistoryView() } label: {
                MacroCard { MacroLinkLabel(title: "Food History") }
            }
            .buttonStyle(.plain)
        }
        .navigationTitle(DateUtils.title(for: day))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add Food", systemImage: "plus") { add(nil) }
            }
        }
        .sheet(item: $editing) { EntryEditSheet(entry: $0, date: day) }
    }

    private func add(_ meal: MealType?) {
        router.presentAddFood(for: router.selectedDate, meal: meal)
    }

    private func headline(_ t: MacroTotals, _ g: Targets) -> String {
        let diff = g.calories - Int(t.calories.rounded())
        return diff >= 0 ? "\(diff) kcal left" : "\(-diff) kcal over"
    }

    private func narrative(_ t: MacroTotals, _ g: Targets, _ any: Bool) -> String {
        guard any else { return "Nothing logged yet. Your target is \(g.calories) kcal." }
        let short = Double(g.protein) - t.protein
        if short >= 1 { return "You're \(Int(short.rounded())) g short on protein." }
        return "Protein target hit. \(Int(t.calories.rounded())) of \(g.calories) kcal so far."
    }

    private var greetingLine: String {
        let name = MacroGreeting.firstName(of: store.user?.displayName ?? store.profile.name)
        return name.map { "\(MacroGreeting.timeOfDay()), \($0)" } ?? MacroGreeting.timeOfDay()
    }

    /// LabMate-style chip strip; grams live here so the card can be rings only.
    private func chipStrip(_ t: MacroTotals, _ g: Targets) -> some View {
        func fraction(_ v: Double, _ goal: Int) -> Double { goal > 0 ? min(1, max(0, v / Double(goal))) : 0 }
        func chip(_ title: String, _ value: String, _ f: Double, _ color: Color) -> some View {
            SummaryChip(title: title, value: value) {
                ScoreRing(segments: [(f, color)], label: "", lineWidth: 5, size: 30)
            }
            .accessibilityElement(children: .combine)
        }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                chip("Calories", "\(Int(t.calories.rounded())) / \(g.calories)", fraction(t.calories, g.calories), MacroColor.calories)
                chip("Protein", "\(TodayFormat.g(t.protein)) / \(g.protein) g", fraction(t.protein, g.protein), MacroColor.protein)
                chip("Carbs", "\(TodayFormat.g(t.carbs)) / \(g.carbs) g", fraction(t.carbs, g.carbs), MacroColor.carbs)
                chip("Fat", "\(TodayFormat.g(t.fat)) / \(g.fat) g", fraction(t.fat, g.fat), MacroColor.fat)
            }
            .padding(.horizontal, MacroMetrics.pagePadding)
        }
    }
}

#Preview {
    NavigationStack { TodayView() }
        .environment(AppStore.preview)
        .environment(AppRouter())
}
