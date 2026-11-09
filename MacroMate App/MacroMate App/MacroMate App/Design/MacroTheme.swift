import SwiftUI

// Design language modelled on the redesigned Apple Health app (same system as LabMate):
// grouped-grey canvas, continuous-corner cards, large bold editorial headlines with a
// secondary-grey narrative, a strip of summary chips, a floating Liquid Glass tab bar.
// Macro colours follow the web theme: calories green, protein blue, carbs orange, fat yellow.

nonisolated enum MacroColor {
    static let calories = Color(red: 0.20, green: 0.78, blue: 0.35)   // #34C759
    static let protein = Color(red: 0.23, green: 0.51, blue: 0.96)    // web #3b82f6
    static let carbs = Color(red: 0.98, green: 0.45, blue: 0.09)      // web #f97316
    static let fat = Color(red: 0.92, green: 0.70, blue: 0.03)        // web #eab308

    static let good = Color(red: 0.20, green: 0.78, blue: 0.35)
    static let warning = Color(red: 1.00, green: 0.80, blue: 0.00)
    static let critical = Color(red: 1.00, green: 0.23, blue: 0.19)

    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let track = Color(uiColor: .systemFill)
    static let narrative = Color.secondary
}

nonisolated enum MacroMetrics {
    static let cardRadius: CGFloat = 26
    static let chipRadius: CGFloat = 18
    static let pagePadding: CGFloat = 20
    static let cardPadding: CGFloat = 18
}

// MARK: - Typography

extension View {
    /// Large editorial headline, e.g. "620 kcal left".
    func macroHeadline() -> some View {
        font(.system(size: 34, weight: .bold)).foregroundStyle(.primary)
    }
    /// Grey narrative paragraph under a headline.
    func macroNarrative() -> some View {
        font(.title3).foregroundStyle(MacroColor.narrative)
    }
    /// Small grey caption at the top of a card ("Breakfast", "Protein").
    func macroCardEyebrow() -> some View {
        font(.subheadline).foregroundStyle(.secondary)
    }
}

// MARK: - Card

struct MacroCard<Content: View>: View {
    var padding: CGFloat = MacroMetrics.cardPadding
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(MacroColor.card, in: .rect(cornerRadius: MacroMetrics.cardRadius, style: .continuous))
    }
}

/// Card header: grey eyebrow + bold status line, optional trailing visual (ring/total).
struct MacroCardHeader<Trailing: View>: View {
    let eyebrow: String
    let title: String
    var titleColor: Color = .primary
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow).macroCardEyebrow()
                Text(title).font(.title3.weight(.semibold)).foregroundStyle(titleColor)
            }
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension MacroCardHeader where Trailing == EmptyView {
    init(eyebrow: String, title: String, titleColor: Color = .primary) {
        self.init(eyebrow: eyebrow, title: title, titleColor: titleColor) { EmptyView() }
    }
}

/// Coloured "Food history ›" style link row.
struct MacroLinkLabel: View {
    let title: String
    var color: Color = MacroColor.calories
    var symbol: String = "clock.arrow.circlepath"
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
            Text(title)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .font(.headline)
        .foregroundStyle(color)
    }
}

// MARK: - Summary chip strip

struct SummaryChip<Icon: View>: View {
    let title: String
    let value: String
    var selected: Bool = false
    @ViewBuilder var icon: Icon

    var body: some View {
        HStack(spacing: 10) {
            icon.frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.subheadline).foregroundStyle(.secondary)
                Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
            }
            .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(selected ? MacroColor.card : MacroColor.card.opacity(0.6),
                    in: .rect(cornerRadius: MacroMetrics.chipRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: MacroMetrics.chipRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(selected ? 0 : 0.06))
        )
        .shadow(color: .black.opacity(selected ? 0.08 : 0), radius: 8, y: 2)
    }
}

// MARK: - Score ring (multi-segment ring with a label in the middle)

struct ScoreRing: View {
    /// Segments as (fraction 0...1, colour), drawn sequentially around the ring.
    let segments: [(Double, Color)]
    let label: String
    var lineWidth: CGFloat = 14
    var size: CGFloat = 110

    var body: some View {
        ZStack {
            Circle().stroke(MacroColor.track, lineWidth: lineWidth)
            ForEach(Array(segmentRanges.enumerated()), id: \.offset) { _, seg in
                Circle()
                    .trim(from: seg.start, to: seg.end)
                    .stroke(seg.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Text(label)
                .font(.system(size: size * 0.3, weight: .bold, design: .rounded))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .padding(lineWidth)
        }
        .frame(width: size, height: size)
    }

    private var segmentRanges: [(start: Double, end: Double, color: Color)] {
        var cursor = 0.0
        var out: [(start: Double, end: Double, color: Color)] = []
        let gap = segments.count > 1 ? 0.02 : 0
        for (frac, color) in segments where frac > 0 {
            let end = min(1, cursor + frac)
            out.append((cursor, max(cursor, end - gap), color))
            cursor = end
        }
        return out
    }
}

// MARK: - Concentric macro rings (port of the web ActivityRings)

/// One ring: progress = value / goal (clamped to 1 when drawn).
struct MacroRing: Identifiable {
    var id: String { label }
    let label: String
    let value: Double
    let goal: Double
    let color: Color
    var unit: String = "g"

    var progress: Double { goal > 0 ? min(1, max(0, value / goal)) : 0 }

    /// Standard protein (outer) / carbs / fat (inner) rings for a day.
    static func macros(totals: MacroTotals, targets: Targets) -> [MacroRing] {
        [
            MacroRing(label: "Protein", value: totals.protein, goal: Double(targets.protein), color: MacroColor.protein),
            MacroRing(label: "Carbs", value: totals.carbs, goal: Double(targets.carbs), color: MacroColor.carbs),
            MacroRing(label: "Fat", value: totals.fat, goal: Double(targets.fat), color: MacroColor.fat),
        ]
    }
}

/// Concentric rings (outer -> inner) with a calorie figure in the centre.
struct MacroRings: View {
    let rings: [MacroRing]
    let centerValue: String
    var centerCaption: String = "kcal"
    var size: CGFloat = 190
    var lineWidth: CGFloat = 16
    var gap: CGFloat = 5

    /// Convenience: protein/carbs/fat rings with calories eaten in the centre.
    init(totals: MacroTotals, targets: Targets, size: CGFloat = 190, lineWidth: CGFloat = 16) {
        self.rings = MacroRing.macros(totals: totals, targets: targets)
        self.centerValue = "\(Int(totals.calories.rounded()))"
        self.centerCaption = "of \(targets.calories) kcal"
        self.size = size
        self.lineWidth = lineWidth
    }

    init(rings: [MacroRing], centerValue: String, centerCaption: String = "kcal",
         size: CGFloat = 190, lineWidth: CGFloat = 16, gap: CGFloat = 5) {
        self.rings = rings
        self.centerValue = centerValue
        self.centerCaption = centerCaption
        self.size = size
        self.lineWidth = lineWidth
        self.gap = gap
    }

    var body: some View {
        ZStack {
            ForEach(Array(rings.enumerated()), id: \.element.id) { index, ring in
                let inset = CGFloat(index) * (lineWidth + gap) + lineWidth / 2
                ZStack {
                    Circle().stroke(ring.color.opacity(0.18), lineWidth: lineWidth)
                    Circle()
                        .trim(from: 0, to: ring.progress)
                        .stroke(ring.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .padding(inset)
            }
            VStack(spacing: 0) {
                Text(centerValue)
                    .font(.system(size: size * 0.2, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text(centerCaption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(CGFloat(rings.count) * (lineWidth + gap) + 4)
        }
        .frame(width: size, height: size)
        .animation(.smooth, value: rings.map(\.progress))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(centerValue) \(centerCaption). " + rings.map {
            "\($0.label) \(Int($0.value.rounded())) of \(Int($0.goal.rounded())) \($0.unit)"
        }.joined(separator: ", "))
    }
}

/// Slim horizontal progress bar for a macro (value vs goal).
struct MacroBar: View {
    let value: Double
    let goal: Double
    var color: Color = MacroColor.calories
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(color.opacity(0.18))
                Capsule().fill(color)
                    .frame(width: geo.size.width * (goal > 0 ? min(1, max(0, value / goal)) : 0))
            }
        }
        .frame(height: height)
    }
}

// MARK: - Greeting (same thresholds as LabMate/GymMate)

nonisolated enum MacroGreeting {
    static func timeOfDay(hour: Int = Calendar.current.component(.hour, from: Date())) -> String {
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    static func firstName(of name: String?) -> String? {
        guard let first = name?.split(separator: " ").first, !first.isEmpty else { return nil }
        return String(first)
    }
}

// MARK: - Page scaffold

/// Grouped-grey scrolling page with the standard Health horizontal padding.
struct MacroPage<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) { content }
                .padding(.horizontal, MacroMetrics.pagePadding)
                .padding(.bottom, 32)
        }
        .background(MacroColor.canvas.ignoresSafeArea())
    }
}

#Preview("Components") {
    let totals = MacroTotals(calories: 1380, protein: 96, carbs: 140, fat: 41)
    MacroPage {
        MacroRings(totals: totals, targets: .defaults).frame(maxWidth: .infinity)
        ScrollView(.horizontal) {
            HStack {
                SummaryChip(title: "Protein", value: "96 / 150 g", selected: true) {
                    ScoreRing(segments: [(0.64, MacroColor.protein)], label: "", lineWidth: 5, size: 30)
                }
                SummaryChip(title: "Carbs", value: "140 / 200 g") {
                    ScoreRing(segments: [(0.7, MacroColor.carbs)], label: "", lineWidth: 5, size: 30)
                }
            }
        }
        MacroCard {
            MacroCardHeader(eyebrow: "Breakfast", title: "420 kcal") {
                ScoreRing(segments: [(0.4, MacroColor.protein), (0.3, MacroColor.carbs), (0.2, MacroColor.fat)], label: "3", size: 50)
            }
            MacroBar(value: 96, goal: 150, color: MacroColor.protein)
        }
    }
}
