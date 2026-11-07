import SwiftUI
import Vision
import VisionKit

/// VisionKit scanner wrapper (EAN-13 / EAN-8 / UPC-E).
struct BarcodeScannerView: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {
        context.coordinator.onCode = onCode
        if !vc.isScanning { try? vc.startScanning() }
    }

    static func dismantleUIViewController(_ vc: DataScannerViewController, coordinator: Coordinator) {
        vc.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onCode: (String) -> Void
        private var fired = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            guard !fired else { return }
            for case .barcode(let b) in addedItems {
                if let code = b.payloadStringValue, !code.isEmpty {
                    fired = true
                    scanner.stopScanning()
                    onCode(code)
                    return
                }
            }
        }
    }
}

/// Barcode lookup screen: live scanner with manual-entry fallback.
struct BarcodeView: View {
    let onFood: (FoodItem) -> Void
    let onQuickAdd: () -> Void

    @Environment(AppStore.self) private var store
    @State private var phase: Phase = .scanning
    @State private var manualCode = ""

    private enum Phase: Equatable { case scanning, lookup(String), notFound(String) }

    private var scannerAvailable: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    var body: some View {
        Group {
            switch phase {
            case .scanning: scanning
            case .lookup(let code):
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Looking up \(code)\u{2026}").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .notFound(let code):
                ContentUnavailableView {
                    Label("Not found", systemImage: "magnifyingglass")
                } description: {
                    Text("No product matched barcode \(code). You can enter the macros yourself.")
                } actions: {
                    Button("Quick Add") { onQuickAdd() }.buttonStyle(.glassProminent)
                    Button("Scan again") { phase = .scanning }
                }
            }
        }
        .navigationTitle("Scan Barcode")
        .navigationBarTitleDisplayMode(.inline)
        .background(MacroColor.canvas)
    }

    private var scanning: some View {
        VStack(spacing: 16) {
            if scannerAvailable {
                BarcodeScannerView { lookup($0) }
                    .clipShape(.rect(cornerRadius: MacroMetrics.cardRadius, style: .continuous))
                    .frame(maxHeight: 360)
                    .padding(.horizontal, MacroMetrics.pagePadding)
            } else {
                ContentUnavailableView("Scanner unavailable", systemImage: "camera.metering.unknown",
                                       description: Text("The camera scanner isn't available here. Enter the barcode below."))
                    .frame(maxHeight: 260)
            }
            MacroCard {
                Text("Or enter the number").macroCardEyebrow()
                HStack {
                    TextField("Barcode", text: $manualCode)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    Button("Look up") { lookup(manualCode.trimmingCharacters(in: .whitespaces)) }
                        .buttonStyle(.glassProminent)
                        .disabled(manualCode.trimmingCharacters(in: .whitespaces).count < 6)
                }
            }
            .padding(.horizontal, MacroMetrics.pagePadding)
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
    }

    private func lookup(_ code: String) {
        phase = .lookup(code)
        Task {
            if var item = await store.search.barcode(code) {
                item.source = .barcode
                onFood(item)
            } else {
                phase = .notFound(code)
            }
        }
    }
}

#Preview {
    NavigationStack { BarcodeView(onFood: { _ in }, onQuickAdd: {}) }
        .environment(AppStore.preview)
}
