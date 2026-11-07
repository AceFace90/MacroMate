import SwiftUI

/// Profile tab: live "Current Goals" card on top of an editable inset-grouped form.
struct ProfileView: View {
    @Environment(AppStore.self) private var store

    @State private var draft = Profile.empty
    @State private var loaded = false
    @State private var saveState: SaveState = .idle
    @State private var importing = false
    @State private var importMessage: String?

    private enum SaveState: Equatable { case idle, saving, saved, failed }

    private static let splits = ["40/60", "50/50", "60/40", "70/30"]

    private var goal: GoalType { draft.goalType ?? .maintenance }
    private var targets: Targets? { Calculations.computeGoalTargets(draft) }
    private var isDirty: Bool { draft != store.profile }

    var body: some View {
        List {
            Section {
                goalsCard
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            if targets == nil {
                Section {
                    Label("Add your weight, height and date of birth to calculate personalised targets. Until then default targets (2000 kcal) are used.",
                          systemImage: "lightbulb.fill")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            personalSection
            goalSection
            Section {
                Button(action: save) {
                    HStack {
                        Spacer()
                        switch saveState {
                        case .saving: ProgressView()
                        case .saved: Label("Saved", systemImage: "checkmark.circle.fill")
                        case .failed: Label("Couldn't save. Try again", systemImage: "exclamationmark.triangle.fill")
                        case .idle: Text("Save Profile")
                        }
                        Spacer()
                    }
                    .font(.headline)
                }
                .disabled(saveState == .saving || (!isDirty && saveState != .failed))
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(MacroColor.canvas.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.large)
        .onAppear { if !loaded { draft = store.profile; loaded = true } }
        .onChange(of: store.profile) { _, new in if !isDirty || saveState == .saved { draft = new } }
        .onChange(of: draft) { if saveState != .saving { saveState = .idle } }
    }

    // MARK: Goals card

    private var goalsCard: some View {
        let t = targets ?? .defaults
        return MacroCard {
            MacroCardHeader(eyebrow: "Current Goals", title: goal.longTitle)
            Text("\(t.calories) kcal").macroHeadline()
            HStack(spacing: 10) {
                macroPill("Protein", t.protein, MacroColor.protein)
                macroPill("Carbs", t.carbs, MacroColor.carbs)
                macroPill("Fat", t.fat, MacroColor.fat)
            }
            if let bmr = t.bmr, let tdee = t.tdee {
                Text("BMR \(bmr) kcal  •  TDEE \(tdee) kcal")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                Text("Default targets").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func macroPill(_ name: String, _ grams: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name).font(.caption).foregroundStyle(.secondary)
            Text("\(grams) g").font(.headline).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(color.opacity(0.12), in: .rect(cornerRadius: 14, style: .continuous))
    }

    // MARK: Form sections

    private var personalSection: some View {
        Section("About You") {
            TextField("Name", text: Binding(
                get: { draft.name ?? "" },
                set: { draft.name = $0.isEmpty ? nil : $0 }))

            HStack {
                Text("Weight (kg)")
                Spacer()
                TextField("kg", value: $draft.weightKg, format: .number.precision(.fractionLength(0...1)))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 100)
            }
            if store.healthEnabled {
                Button {
                    Task {
                        importing = true
                        defer { importing = false }
                        if let kg = await store.latestHealthWeight() {
                            draft.weightKg = (kg * 10).rounded() / 10
                            importMessage = nil
                        } else {
                            importMessage = "No weight found in Apple Health."
                        }
                    }
                } label: {
                    HStack {
                        MacroLinkLabel(title: "Import from Apple Health", color: MacroColor.critical, symbol: "heart.fill")
                        if importing { Spacer(); ProgressView() }
                    }
                }
                .disabled(importing)
                if let importMessage { Text(importMessage).font(.footnote).foregroundStyle(.secondary) }
            }

            HStack {
                Text("Height (cm)")
                Spacer()
                TextField("cm", value: $draft.heightCm, format: .number.precision(.fractionLength(0...1)))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 100)
            }

            DatePicker("Date of birth", selection: dobBinding, in: ...Date(), displayedComponents: .date)

            Picker("Gender", selection: $draft.gender) {
                Text("Not set").tag(Gender?.none)
                ForEach(Gender.allCases) { Text($0.title).tag(Gender?.some($0)) }
            }

            Picker("Activity level", selection: $draft.activityLevel) {
                Text("Not set").tag(ActivityLevel?.none)
                ForEach(ActivityLevel.allCases) { Text($0.title).tag(ActivityLevel?.some($0)) }
            }
            if let a = draft.activityLevel {
                Text(a.detail).font(.footnote).foregroundStyle(.secondary)
            }

            Picker("Country", selection: Binding(
                get: { draft.country ?? "AU" },
                set: { draft.country = $0 })) {
                ForEach(CountryConfig.all) { Text($0.label).tag($0.code) }
            }
        }
    }

    private var goalSection: some View {
        Section {
            Picker("Goal", selection: Binding(
                get: { goal },
                set: { draft.goalType = $0 })) {
                ForEach(GoalType.allCases) { Text($0.title).tag($0) }
            }

            if goal != .maintenance {
                Stepper(value: Binding(
                    get: { draft.calorieDeficit ?? defaultAdjustment },
                    set: { draft.calorieDeficit = $0 }), in: 0...1500, step: 50) {
                    LabeledContent(goal == .weightLoss ? "Daily deficit" : "Daily surplus",
                                   value: "\(draft.calorieDeficit ?? defaultAdjustment) kcal")
                }
            }

            Stepper(value: Binding(
                get: { draft.proteinPerKg ?? 2.0 },
                set: { draft.proteinPerKg = $0 }), in: 0.5...4.0, step: 0.1) {
                LabeledContent("Protein", value: String(format: "%.1f g/kg", draft.proteinPerKg ?? 2.0))
            }

            Picker("Carbs / fat split", selection: Binding(
                get: { draft.carbsFatSplit ?? "50/50" },
                set: { draft.carbsFatSplit = $0 })) {
                ForEach(splitOptions, id: \.self) { s in
                    Text(splitLabel(s)).tag(s)
                }
            }
        } header: {
            Text("Goal")
        } footer: {
            Text("Protein is set per kg of body weight; the remaining calories are divided between carbs and fat.")
        }
    }

    private var defaultAdjustment: Int { goal == .weightLoss ? 500 : 200 }

    private var splitOptions: [String] {
        let cur = draft.carbsFatSplit ?? "50/50"
        return Self.splits.contains(cur) ? Self.splits : Self.splits + [cur]
    }

    private func splitLabel(_ s: String) -> String {
        let p = s.split(separator: "/")
        return p.count == 2 ? "\(p[0])% carbs / \(p[1])% fat" : s
    }

    private var dobBinding: Binding<Date> {
        Binding(
            get: { draft.dob.flatMap(DateUtils.date(from:)) ?? Calendar.current.date(byAdding: .year, value: -30, to: .now) ?? .now },
            set: { draft.dob = DateUtils.key(for: $0) })
    }

    private func save() {
        saveState = .saving
        Task {
            let ok = await store.saveProfile(draft)
            saveState = ok ? .saved : .failed
        }
    }
}

#Preview {
    NavigationStack { ProfileView() }
        .environment(AppStore.preview)
        .environment(AppRouter())
}
