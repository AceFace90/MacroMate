import SwiftUI

/// Past days (newest first) with daily totals; expands to entries. Port of FoodHistoryScreen.js.
struct FoodHistoryView: View {
    @Environment(AppStore.self) private var store
    @State private var expanded: Set<String> = []
    @State private var editing: (entry: FoodEntry, date: String)?

    private var days: [String] {
        store.entries.filter { !$0.value.isEmpty }.keys.sorted(by: >)
    }

    var body: some View {
        MacroPage {
            if days.isEmpty {
                ContentUnavailableView("No history yet", systemImage: "clock.arrow.circlepath",
                                       description: Text("Foods you log will show up here by day."))
                    .padding(.top, 60)
            }
            ForEach(days, id: \.self) { day in
                dayCard(day)
            }
        }
        .navigationTitle("Food History")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } })) {
            if let editing { EntryEditSheet(entry: editing.entry, date: editing.date) }
        }
    }

    private func dayCard(_ day: String) -> some View {
        let t = store.totals(for: day)
        let open = expanded.contains(day)
        let list = store.entries(for: day).sorted { $0.loggedAt < $1.loggedAt }
        return MacroCard {
            Button {
                withAnimation(.snappy) { if open { expanded.remove(day) } else { expanded.insert(day) } }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(DateUtils.title(for: day)).font(.headline).foregroundStyle(.primary)
                        Text("P \(TodayFormat.g(t.protein))  C \(TodayFormat.g(t.carbs))  F \(TodayFormat.g(t.fat))  ·  \(list.count) items")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(Int(t.calories.rounded())) kcal").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    Image(systemName: "chevron.down").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)

            if open {
                ForEach(list) { e in
                    Divider()
                    Button { editing = (e, day) } label: {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.name).foregroundStyle(.primary).lineLimit(2)
                                Text("\(e.mealType.title)  ·  \(TodayFormat.g(e.quantityG)) g  ·  \(TodayFormat.macros(e))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 8)
                            Text("\(e.calories) kcal").font(.subheadline).foregroundStyle(.primary)
                        }
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Delete", systemImage: "trash", role: .destructive) { store.removeEntry(id: e.id, on: day) }
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack { FoodHistoryView() }.environment(AppStore.preview)
}
