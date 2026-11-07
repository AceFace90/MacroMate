import SwiftUI
import Charts

/// Trends tab: range picker, headline narrative, summary chips, then chart cards.
struct TrendsView: View {
    @Environment(AppStore.self) private var store

    @State private var range: TrendRange = .week
    @State private var weight: [WeightPoint] = []

    private var summary: TrendSummary {
        TrendSummary(days: store.trendDays(range.rawValue), targets: store.targets, streak: store.trendStreak())
    }

    var body: some View {
        let s = summary
        MacroPage {
            Picker("Range", selection: $range) {
                ForEach(TrendRange.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 8)

            if s.loggedDays.isEmpty {
                emptyState
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(s.headline).macroHeadline()
                    Text(s.narrative).macroNarrative()
                }
                chips(s)
                CaloriesChartCard(summary: s)
                MacroAveragesCard(summary: s)
                ProteinChartCard(summary: s)
                AdherenceCard(summary: s)
            }
            if store.healthEnabled { WeightChartCard(points: weight, days: range.rawValue) }
        }
        .navigationTitle("Trends")
        .navigationBarTitleDisplayMode(.inline)
        .animation(.smooth, value: range)
        .task(id: range) {
            guard store.healthEnabled else { weight = []; return }
            let h = await store.health.bodyMassHistory(days: range.rawValue)
            weight = h.map { WeightPoint(date: $0.date, kg: $0.kg) }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No data yet", systemImage: "chart.bar.xaxis")
        } description: {
            Text("Log some food and your trends will show up here for the last \(range.rawValue) days.")
        }
        .padding(.top, 40)
    }

    private func chips(_ s: TrendSummary) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                SummaryChip(title: "Avg calories", value: "\(Int(s.avg.calories.rounded())) kcal") {
                    ScoreRing(segments: [(min(1, s.calorieRatio), MacroColor.calories)], label: "", lineWidth: 5, size: 30)
                }
                SummaryChip(title: "Avg protein", value: "\(Int(s.avg.protein.rounded())) g") {
                    ScoreRing(segments: [(min(1, s.ratio(s.avg.protein, s.targets.protein)), MacroColor.protein)], label: "", lineWidth: 5, size: 30)
                }
                SummaryChip(title: "Days logged", value: "\(s.loggedDays.count) of \(range.rawValue)") {
                    Image(systemName: "calendar").foregroundStyle(MacroColor.carbs).font(.title3)
                }
                SummaryChip(title: "Streak", value: "\(s.streak) day\(s.streak == 1 ? "" : "s")") {
                    Image(systemName: "flame.fill").foregroundStyle(MacroColor.carbs).font(.title3)
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
    }
}

// MARK: - Model

enum TrendRange: Int, CaseIterable, Identifiable {
    case week = 7, month = 30, quarter = 90
    var id: Int { rawValue }
    var label: String { "\(rawValue) days" }
}

struct WeightPoint: Identifiable {
    var id: Date { date }
    let date: Date
    let kg: Double
}

struct TrendDay: Identifiable {
    var id: String { key }
    let key: String
    let date: Date
    let totals: MacroTotals
    let logged: Bool
}

struct TrendSummary {
    /// Oldest first.
    let days: [TrendDay]
    let targets: Targets
    let streak: Int

    var loggedDays: [TrendDay] { days.filter(\.logged) }

    var avg: MacroTotals {
        let l = loggedDays
        guard !l.isEmpty else { return .zero }
        let n = Double(l.count)
        let t = l.reduce(MacroTotals.zero) { $0 + $1.totals }
        return MacroTotals(calories: t.calories / n, protein: t.protein / n, carbs: t.carbs / n, fat: t.fat / n)
    }

    func ratio(_ v: Double, _ goal: Int) -> Double { goal > 0 ? v / Double(goal) : 0 }
    var calorieRatio: Double { ratio(avg.calories, targets.calories) }

    var headline: String { "You averaged \(Int(avg.calories.rounded()).formatted()) kcal" }
    var narrative: String {
        let pct = Int((calorieRatio * 100).rounded())
        return "That is \(pct)% of your \(targets.calories.formatted()) kcal target, across \(loggedDays.count) logged day\(loggedDays.count == 1 ? "" : "s")."
    }

    func isWithin(_ d: TrendDay) -> Bool {
        let r = ratio(d.totals.calories, targets.calories)
        return d.logged && r >= 0.9 && r <= 1.1
    }
    var withinCount: Int { loggedDays.filter(isWithin).count }
}

extension AppStore {
    /// Last `n` days, oldest first.
    func trendDays(_ n: Int) -> [TrendDay] {
        DateUtils.previousDays(n).reversed().compactMap { key in
            guard let date = DateUtils.date(from: key) else { return nil }
            let t = totals(for: key)
            return TrendDay(key: key, date: date, totals: t, logged: !entries(for: key).isEmpty)
        }
    }

    /// Consecutive logged days ending today (or yesterday if today is not logged yet).
    func trendStreak() -> Int {
        var count = 0
        for (i, key) in DateUtils.previousDays(400).enumerated() {
            if entries(for: key).isEmpty {
                if i == 0 { continue }
                break
            }
            count += 1
        }
        return count
    }
}

// MARK: - Shared chart helpers

private func nearestDay(_ days: [TrendDay], to date: Date?) -> TrendDay? {
    guard let date else { return nil }
    return days.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
}

private struct SelectionReadout: View {
    let day: TrendDay?
    let text: (TrendDay) -> String
    var body: some View {
        Group {
            if let day {
                Text("\(DateUtils.longLabel(day.key)): \(text(day))")
            } else {
                Text("Touch and hold a day for details").foregroundStyle(.secondary)
            }
        }
        .font(.footnote)
    }
}

// MARK: - Calories

private struct CaloriesChartCard: View {
    let summary: TrendSummary
    @State private var selected: Date?

    var body: some View {
        let target = Double(summary.targets.calories)
        let sel = nearestDay(summary.days, to: selected)
        MacroCard {
            MacroCardHeader(eyebrow: "Daily calories", title: "Target \(summary.targets.calories.formatted()) kcal")
            Chart {
                ForEach(summary.days) { d in
                    if d.logged {
                        BarMark(x: .value("Day", d.date, unit: .day), y: .value("kcal", d.totals.calories))
                            .foregroundStyle(d.totals.calories > target * 1.1 ? MacroColor.carbs : MacroColor.calories)
                            .opacity(sel == nil || sel?.key == d.key ? 1 : 0.4)
                            .cornerRadius(3)
                    }
                }
                RuleMark(y: .value("Target", target))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    .foregroundStyle(.secondary)
            }
            .chartXSelection(value: $selected)
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
            .frame(height: 200)
            SelectionReadout(day: sel) { d in d.logged ? "\(Int(d.totals.calories.rounded())) kcal" : "not logged" }
            Text("Orange bars are more than 10% over target. Gaps are days with nothing logged.")
                .font(.caption).foregroundStyle(.tertiary)
        }
    }
}

// MARK: - Macros

private struct MacroAveragesCard: View {
    let summary: TrendSummary

    var body: some View {
        let a = summary.avg, t = summary.targets
        let pk = a.protein * 4, ck = a.carbs * 4, fk = a.fat * 9
        let total = max(1, pk + ck + fk)
        MacroCard {
            MacroCardHeader(eyebrow: "Macro averages", title: "Average per logged day")
            HStack(alignment: .center, spacing: 18) {
                ScoreRing(segments: [(pk / total, MacroColor.protein), (ck / total, MacroColor.carbs), (fk / total, MacroColor.fat)],
                          label: "\(Int((pk / total * 100).rounded()))%", lineWidth: 12, size: 100)
                    .accessibilityLabel("Calorie split: protein \(Int((pk / total * 100).rounded())) percent, carbs \(Int((ck / total * 100).rounded())) percent, fat \(Int((fk / total * 100).rounded())) percent")
                VStack(spacing: 12) {
                    row("Protein", a.protein, t.protein, MacroColor.protein)
                    row("Carbs", a.carbs, t.carbs, MacroColor.carbs)
                    row("Fat", a.fat, t.fat, MacroColor.fat)
                }
            }
            Text("Ring shows the share of calories from protein, carbs and fat.")
                .font(.caption).foregroundStyle(.tertiary)
        }
    }

    private func row(_ name: String, _ v: Double, _ goal: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name).font(.subheadline)
                Spacer()
                Text("\(Int(v.rounded())) / \(goal) g").font(.subheadline.weight(.semibold))
            }
            MacroBar(value: v, goal: Double(goal), color: color)
        }
    }
}

// MARK: - Protein

private struct ProteinChartCard: View {
    let summary: TrendSummary
    @State private var selected: Date?

    var body: some View {
        let sel = nearestDay(summary.days, to: selected)
        let logged = summary.loggedDays
        MacroCard {
            MacroCardHeader(eyebrow: "Protein", title: "\(Int(summary.avg.protein.rounded())) g average")
            Chart {
                ForEach(logged) { d in
                    AreaMark(x: .value("Day", d.date, unit: .day), y: .value("g", d.totals.protein))
                        .foregroundStyle(MacroColor.protein.opacity(0.15))
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("Day", d.date, unit: .day), y: .value("g", d.totals.protein))
                        .foregroundStyle(MacroColor.protein)
                        .interpolationMethod(.monotone)
                }
                if let sel, sel.logged {
                    PointMark(x: .value("Day", sel.date, unit: .day), y: .value("g", sel.totals.protein))
                        .foregroundStyle(MacroColor.protein)
                }
                RuleMark(y: .value("Target", summary.targets.protein))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    .foregroundStyle(.secondary)
            }
            .chartXScale(domain: (summary.days.first?.date ?? .now)...(summary.days.last?.date ?? .now))
            .chartXSelection(value: $selected)
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
            .frame(height: 160)
            SelectionReadout(day: sel) { d in d.logged ? "\(Int(d.totals.protein.rounded())) g protein" : "not logged" }
        }
    }
}

// MARK: - Adherence

private struct AdherenceCard: View {
    let summary: TrendSummary

    var body: some View {
        let n = summary.withinCount, total = summary.loggedDays.count
        let frac = total > 0 ? Double(n) / Double(total) : 0
        MacroCard {
            MacroCardHeader(eyebrow: "Adherence", title: "\(n) of \(total) days on target") {
                ScoreRing(segments: [(frac, MacroColor.good)], label: "\(Int((frac * 100).rounded()))%", lineWidth: 8, size: 64)
            }
            Text("Days where calories landed within 10% of your \(summary.targets.calories.formatted()) kcal target.")
                .font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: 3) {
                ForEach(summary.days.suffix(30)) { d in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(!d.logged ? MacroColor.track : summary.isWithin(d) ? MacroColor.good : MacroColor.warning)
                        .frame(height: 18)
                }
            }
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Weight

private struct WeightChartCard: View {
    let points: [WeightPoint]
    let days: Int

    var body: some View {
        MacroCard {
            if points.count < 1 {
                MacroCardHeader(eyebrow: "Weight", title: "No readings")
                Text("No body weight found in Apple Health for the last \(days) days.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                let change = (points.last?.kg ?? 0) - (points.first?.kg ?? 0)
                MacroCardHeader(eyebrow: "Weight", title: String(format: "%.1f kg", points.last?.kg ?? 0)) {
                    if points.count > 1 {
                        Text(String(format: "%+.1f kg", change)).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    }
                }
                Chart(points) { p in
                    LineMark(x: .value("Date", p.date), y: .value("kg", p.kg))
                        .foregroundStyle(MacroColor.protein)
                        .interpolationMethod(.monotone)
                    PointMark(x: .value("Date", p.date), y: .value("kg", p.kg))
                        .foregroundStyle(MacroColor.protein)
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .frame(height: 160)
            }
        }
    }
}

#Preview("Empty") {
    NavigationStack { TrendsView() }.environment(AppStore())
}

#Preview("With data") {
    NavigationStack { TrendsView() }.environment(AppStore.preview)
}
