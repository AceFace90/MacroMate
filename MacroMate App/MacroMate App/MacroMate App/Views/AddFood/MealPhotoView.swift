import SwiftUI

/// Meal photo: capture, AI analysis, editable review, resolve + log all selected items.
struct MealPhotoView: View {
    let date: String
    let finish: () -> Void

    @Environment(AppStore.self) private var store
    @State private var meal: MealType
    @State private var phase: Phase = .capture
    @State private var rows: [Row] = []
    @State private var errorText: String?

    private enum Phase: Equatable { case capture, analyzing, review, logging(done: Int, total: Int) }
    private struct Row: Identifiable {
        var item: GeminiService.MealPhotoItem
        var include = true
        var id: UUID { item.id }
    }

    private static let units = ["g", "ml", "cup", "tbsp", "tsp", "piece", "slice"]

    init(date: String, meal: MealType, finish: @escaping () -> Void) {
        self.date = date
        self.finish = finish
        _meal = State(initialValue: meal)
    }

    var body: some View {
        Group {
            switch phase {
            case .capture:
                ImageCaptureCard(symbol: "camera.viewfinder", title: "Snap your meal",
                                 message: "AI will list what it sees. You can edit everything before logging.") { analyze($0) }
            case .analyzing:
                progress("Analysing your meal\u{2026}")
            case .review:
                review
            case .logging(let done, let total):
                progress("Logging \(min(done + 1, total)) of \(total)\u{2026}")
            }
        }
        .navigationTitle("Meal Photo")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(isBusy)
        .background(MacroColor.canvas)
        .alert("Something went wrong", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorText ?? "") }
    }

    private var isBusy: Bool {
        switch phase { case .analyzing, .logging: true; default: false }
    }

    private func progress(_ text: String) -> some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large)
            Text(text).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var review: some View {
        Form {
            Section {
                Picker("Meal", selection: $meal) {
                    ForEach(MealType.allCases) { Text($0.title).tag($0) }
                }
            }
            Section("Detected items") {
                if rows.isEmpty {
                    Text("Nothing detected. Try another photo.").foregroundStyle(.secondary)
                }
                ForEach($rows) { $row in
                    VStack(alignment: .leading, spacing: 8) {
                        Toggle(isOn: $row.include) {
                            TextField("Name", text: $row.item.name)
                        }
                        HStack {
                            TextField("Qty", value: $row.item.quantity, format: .number)
                                .keyboardType(.decimalPad)
                                .frame(maxWidth: 80)
                                .textFieldStyle(.roundedBorder)
                            Picker("Unit", selection: $row.item.unit) {
                                ForEach(Self.units, id: \.self) { Text($0).tag($0) }
                            }
                            .labelsHidden()
                            Spacer()
                            Text("\u{2248} \(QuantityExtraction.formatQuantity(row.item.grams))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .disabled(!row.include)
                    }
                    .padding(.vertical, 2)
                }
                .onDelete { rows.remove(atOffsets: $0) }
            }
            Section {
                Button("Retake photo") { rows = []; phase = .capture }
            }
        }
        .safeAreaInset(edge: .bottom) {
            let count = rows.filter(\.include).count
            Button {
                Task { await logSelected() }
            } label: {
                Text(count == 1 ? "Log 1 item" : "Log \(count) items").font(.headline).frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(count == 0)
            .padding(.horizontal, MacroMetrics.pagePadding)
            .padding(.bottom, 8)
        }
    }

    private func analyze(_ jpeg: Data) {
        phase = .analyzing
        Task {
            do {
                let items = try await store.ai.analyzeMealPhoto(jpeg)
                rows = items.map { Row(item: $0) }
                phase = .review
            } catch {
                errorText = error.localizedDescription
                phase = .capture
            }
        }
    }

    private func logSelected() async {
        let chosen = rows.filter(\.include)
        guard !chosen.isEmpty else { return }
        let history = store.historyFoods()
        var failed: [UUID] = []
        for (i, row) in chosen.enumerated() {
            phase = .logging(done: i, total: chosen.count)
            if let r = await store.search.resolve(row.item, history: history, saved: store.savedFoods,
                                                  country: store.profile.country, ai: store.ai) {
                AddFoodLogger.log(r.food, grams: r.grams, meal: meal, on: date, store: store)
            } else {
                failed.append(row.id)
            }
        }
        if failed.isEmpty {
            finish()
        } else {
            let names = rows.filter { failed.contains($0.id) }.map(\.item.name).joined(separator: ", ")
            rows = rows.filter { failed.contains($0.id) }
            errorText = "Logged the rest, but couldn't match: \(names)."
            phase = .review
        }
    }
}

#Preview {
    NavigationStack { MealPhotoView(date: DateUtils.todayStr(), meal: .lunch, finish: {}) }
        .environment(AppStore.preview)
}
