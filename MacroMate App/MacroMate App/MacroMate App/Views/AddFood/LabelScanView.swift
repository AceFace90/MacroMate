import SwiftUI

/// Nutrition-label scan: capture, AI extraction, then hand the food to the detail screen.
struct LabelScanView: View {
    let onFood: (FoodItem) -> Void

    @Environment(AppStore.self) private var store
    @State private var analyzing = false
    @State private var errorText: String?

    var body: some View {
        Group {
            if analyzing {
                VStack(spacing: 14) {
                    ProgressView().controlSize(.large)
                    Text("Reading the label\u{2026}").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ImageCaptureCard(symbol: "doc.text.viewfinder", title: "Scan a nutrition label",
                                 message: "Fill the frame with the nutrition panel. The serving size is preselected next.") { analyze($0) }
            }
        }
        .navigationTitle("Nutrition Label")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(analyzing)
        .background(MacroColor.canvas)
        .alert("Something went wrong", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorText ?? "") }
    }

    private func analyze(_ jpeg: Data) {
        analyzing = true
        Task {
            do {
                let result = try await store.ai.analyzeLabel(jpeg)
                onFood(result.foodItem)
            } catch {
                errorText = error.localizedDescription
                analyzing = false
            }
        }
    }
}

#Preview {
    NavigationStack { LabelScanView(onFood: { _ in }) }
        .environment(AppStore.preview)
}
