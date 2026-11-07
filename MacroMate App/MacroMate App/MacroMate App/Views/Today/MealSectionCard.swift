import SwiftUI

/// Format helpers shared by Today views.
enum TodayFormat {
    static func g(_ v: Double) -> String {
        v.rounded() == v ? "\(Int(v))" : String(format: "%.1f", v)
    }
    static func macros(_ e: FoodEntry) -> String {
        "P \(g(e.proteinG))  C \(g(e.carbsG))  F \(g(e.fatG))"
    }
}

struct MealSectionCard: View {
    let meal: MealType
    let entries: [FoodEntry]
    var onAdd: () -> Void
    var onEdit: (FoodEntry) -> Void
    var onDelete: (FoodEntry) -> Void

    private var subtotal: MacroTotals { Calculations.sum(entries) }

    var body: some View {
        MacroCard {
            MacroCardHeader(eyebrow: meal.title,
                            title: entries.isEmpty ? "Nothing logged" : "\(Int(subtotal.calories.rounded())) kcal",
                            titleColor: entries.isEmpty ? .secondary : .primary) {
                Button(action: onAdd) {
                    Image(systemName: "plus").font(.headline).frame(width: 36, height: 36)
                }
                .buttonStyle(.glass)
                .accessibilityLabel("Add to \(meal.title)")
            }

            ForEach(entries) { entry in
                Divider()
                Button { onEdit(entry) } label: {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.name).font(.body).foregroundStyle(.primary).lineLimit(2)
                            Text("\(TodayFormat.g(entry.quantityG)) g  ·  \(TodayFormat.macros(entry))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        Text("\(entry.calories) kcal").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button("Edit", systemImage: "pencil") { onEdit(entry) }
                    Button("Delete", systemImage: "trash", role: .destructive) { onDelete(entry) }
                }
            }

            if !entries.isEmpty {
                Divider()
                HStack(spacing: 14) {
                    Text("Subtotal").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text("P \(TodayFormat.g(subtotal.protein))").foregroundStyle(MacroColor.protein)
                    Text("C \(TodayFormat.g(subtotal.carbs))").foregroundStyle(MacroColor.carbs)
                    Text("F \(TodayFormat.g(subtotal.fat))").foregroundStyle(MacroColor.fat)
                }
                .font(.caption.weight(.semibold))
            }
        }
    }
}
