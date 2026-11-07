import SwiftUI

/// Navigation destinations pushed inside the Add Food sheet.
enum AddFoodRoute: Hashable {
    case food(FoodItem)
    case barcode
    case mealPhoto
    case label
    case quickAdd(String)
}

/// Shared logging helper: verified foods go through `store.log` (which also remembers them);
/// unverified AI estimates are logged without being saved to the verified cache.
@MainActor
enum AddFoodLogger {
    static func log(_ item: FoodItem, grams: Double, meal: MealType, on date: String, store: AppStore) {
        if item.isVerified {
            store.log(item, grams: grams, meal: meal, on: date)
        } else {
            store.addEntry(item.entry(grams: grams, mealType: meal), on: date)
        }
    }
}

struct AddFoodView: View {
    let date: String

    @Environment(AppStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(\.dismiss) private var dismiss

    @State private var appliedRouterMeal = false
    @State private var path: [AddFoodRoute] = []
    @State private var meal = MealType.suggested()
    @State private var query = ""
    @State private var local: [FoodItem] = []
    @State private var online: [FoodItem] = []
    @State private var onlineLoading = false
    @State private var onlineDone = false
    @State private var aiLoading = false
    @State private var errorText: String?

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isSearching: Bool { trimmed.count >= 2 }

    private static let sourceOrder: [FoodSource] = [.history, .saved, .afcd, .opennutrition]

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    Picker("Meal", selection: $meal) {
                        ForEach(MealType.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                if isSearching {
                    searchSections
                } else {
                    Section {
                        tiles
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                    }
                    recentSection
                }
            }
            .listSectionSpacing(.compact)
            .navigationTitle("Add Food")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search foods")
            .onSubmit(of: .search) { Task { await searchOnline() } }
            .task(id: query) { await runLocalSearch() }
            .onAppear {
                guard !appliedRouterMeal else { return }
                appliedRouterMeal = true
                meal = router.selectedMeal ?? MealType.suggested()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .navigationDestination(for: AddFoodRoute.self) { route in
                destination(route)
            }
            .alert("Something went wrong", isPresented: Binding(get: { errorText != nil },
                                                               set: { if !$0 { errorText = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(errorText ?? "") }
        }
    }

    // MARK: Destinations

    @ViewBuilder
    private func destination(_ route: AddFoodRoute) -> some View {
        switch route {
        case .food(let item):
            FoodDetailView(item: item, date: date, meal: meal, finish: { dismiss() })
        case .barcode:
            BarcodeView(
                onFood: { item in replaceTop(with: .food(item)) },
                onQuickAdd: { replaceTop(with: .quickAdd("")) })
        case .mealPhoto:
            MealPhotoView(date: date, meal: meal, finish: { dismiss() })
        case .label:
            LabelScanView(onFood: { item in replaceTop(with: .food(item)) })
        case .quickAdd(let name):
            QuickAddView(date: date, meal: meal, initialName: name, finish: { dismiss() })
        }
    }

    private func replaceTop(with route: AddFoodRoute) {
        if !path.isEmpty { path.removeLast() }
        path.append(route)
    }

    // MARK: Tiles

    private var tiles: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            tile("Scan Barcode", symbol: "barcode.viewfinder", color: MacroColor.protein, subtitle: "Packaged foods") {
                path.append(.barcode)
            }
            tile("Meal Photo", symbol: "camera.fill", color: MacroColor.carbs,
                 subtitle: store.ai.isAvailable ? "AI finds each item" : "Needs Apple Intelligence or a Gemini key") {
                aiGated { path.append(.mealPhoto) }
            }
            tile("Nutrition Label", symbol: "doc.text.viewfinder", color: MacroColor.fat,
                 subtitle: store.ai.isAvailable ? "Read a label" : "Needs Apple Intelligence or a Gemini key") {
                aiGated { path.append(.label) }
            }
            tile("Quick Add", symbol: "square.and.pencil", color: MacroColor.calories, subtitle: "Enter macros") {
                path.append(.quickAdd(""))
            }
        }
        .padding(.vertical, 4)
    }

    private func tile(_ title: String, symbol: String, color: Color, subtitle: String,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol)
                    .font(.title2)
                    .foregroundStyle(color)
                Spacer(minLength: 0)
                Text(title).font(.headline).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
            .padding(MacroMetrics.chipRadius - 4)
            .background(MacroColor.card, in: .rect(cornerRadius: MacroMetrics.chipRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func aiGated(_ action: () -> Void) {
        if store.ai.isAvailable { action() }
        else { errorText = "This feature needs Apple Intelligence or a Gemini API key. Turn on Apple Intelligence, or add a key in Settings, to use AI meal photos and label scanning." }
    }

    // MARK: Recent

    @ViewBuilder
    private var recentSection: some View {
        let recent = Array(store.historyFoods().prefix(15))
        if !recent.isEmpty {
            Section("Recent") {
                ForEach(recent) { foodRow($0) }
            }
        }
    }

    // MARK: Search results

    @ViewBuilder
    private var searchSections: some View {
        ForEach(Self.sourceOrder, id: \.self) { source in
            let items = local.filter { $0.source == source }
            if !items.isEmpty {
                Section(source.title) { ForEach(items) { foodRow($0) } }
            }
        }

        Section {
            Button {
                Task { await searchOnline() }
            } label: {
                HStack {
                    Label("Search Open Food Facts", systemImage: "globe")
                    Spacer()
                    if onlineLoading { ProgressView() }
                }
            }
            .disabled(onlineLoading)
            if onlineDone && online.isEmpty {
                Text("No online results for \u{201C}\(trimmed)\u{201D}.").foregroundStyle(.secondary)
            }
            ForEach(online) { foodRow($0) }

            if store.ai.isAvailable {
                Button {
                    Task { await askAI() }
                } label: {
                    HStack {
                        Label("Estimate with AI", systemImage: "sparkles")
                        Spacer()
                        if aiLoading { ProgressView() }
                    }
                }
                .disabled(aiLoading)
            }
        } header: {
            Text(local.isEmpty ? "No local matches" : "More options")
        } footer: {
            Text("Online search runs when you tap Search on the keyboard or the row above.")
        }
    }

    private func foodRow(_ item: FoodItem) -> some View {
        Button { path.append(.food(item)) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).font(.body).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading)
                    Text(subtitle(for: item)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
        }
    }

    private func subtitle(for item: FoodItem) -> String {
        let grams = item.defaultQuantityG
        let kcal = Int(item.nutrition(forGrams: grams).calories.rounded())
        let per = item.servingSizeG != nil ? (item.servingSizeDisplay ?? QuantityExtraction.formatQuantity(grams)) : "100g"
        return "\(kcal) kcal \u{00B7} \(per) \u{00B7} \(item.source.title)"
    }

    // MARK: Search actions

    private func runLocalSearch() async {
        online = []; onlineDone = false
        guard isSearching else { local = []; return }
        let q = trimmed
        let results = await store.search.localSearch(q, history: store.historyFoods(), saved: store.savedFoods,
                                                     country: store.profile.country, debounce: .milliseconds(250))
        if !Task.isCancelled { local = results }
    }

    private func searchOnline() async {
        let q = trimmed
        guard q.count >= 2, !onlineLoading else { return }
        onlineLoading = true
        let results = await store.search.onlineSearch(q)
        onlineLoading = false
        if q == trimmed { online = results; onlineDone = true }
    }

    private func askAI() async {
        let q = trimmed
        guard !q.isEmpty else { return }
        aiLoading = true
        defer { aiLoading = false }
        do {
            let estimate = try await store.ai.analyzeFood(q)
            path.append(.food(estimate.foodItem))
        } catch {
            errorText = error.localizedDescription
        }
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddFoodView(date: DateUtils.todayStr())
            .environment(AppStore.preview)
            .environment(AppRouter())
    }
}
