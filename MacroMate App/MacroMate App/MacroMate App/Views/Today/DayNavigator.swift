import SwiftUI

/// ‹ Title › strip; tapping the title opens a graphical date picker.
struct DayNavigator: View {
    @Binding var day: String
    @State private var showPicker = false

    private var dateBinding: Binding<Date> {
        Binding(get: { DateUtils.date(from: day) ?? Date() },
                set: { day = DateUtils.key(for: $0) })
    }

    var body: some View {
        HStack(spacing: 8) {
            Button { withAnimation(.snappy) { day = DateUtils.addDays(day, -1) } } label: {
                Image(systemName: "chevron.left").font(.headline).frame(width: 40, height: 40)
            }
            .buttonStyle(.glass)
            .accessibilityLabel("Previous day")

            Button { showPicker = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                    Text(DateUtils.isToday(day) ? "Today, \(DateUtils.shortLabel(day))" : DateUtils.title(for: day))
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 40)
            }
            .buttonStyle(.glass)
            .popover(isPresented: $showPicker) {
                VStack {
                    DatePicker("Day", selection: dateBinding, in: ...Date.distantFuture, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .labelsHidden()
                        .onChange(of: day) { showPicker = false }
                    if !DateUtils.isToday(day) {
                        Button("Jump to Today") { day = DateUtils.todayStr(); showPicker = false }
                    }
                }
                .padding()
                .frame(minWidth: 320)
                .presentationCompactAdaptation(.popover)
            }

            Button { withAnimation(.snappy) { day = DateUtils.addDays(day, 1) } } label: {
                Image(systemName: "chevron.right").font(.headline).frame(width: 40, height: 40)
            }
            .buttonStyle(.glass)
            .accessibilityLabel("Next day")
        }
    }
}

#Preview {
    @Previewable @State var day = DateUtils.todayStr()
    DayNavigator(day: $day).padding()
}
