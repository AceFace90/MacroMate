import SwiftUI
import PhotosUI
import UIKit

enum ImagePrep {
    /// Downscales so the longest side is at most `maxSide`, then JPEG-encodes.
    static func jpeg(from image: UIImage, maxSide: CGFloat = 1024, quality: CGFloat = 0.7) -> Data? {
        let size = image.size
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}

/// UIImagePickerController (camera) wrapper.
struct CameraPicker: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// Camera / photo library chooser that yields downscaled JPEG data.
struct ImageCaptureCard: View {
    let symbol: String
    let title: String
    let message: String
    let onImage: (Data) -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var errorText: String?

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: symbol).font(.system(size: 56)).foregroundStyle(MacroColor.calories)
            Text(title).macroHeadline().multilineTextAlignment(.center)
            Text(message).macroNarrative().multilineTextAlignment(.center)
            VStack(spacing: 12) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button { showCamera = true } label: {
                        Label("Take Photo", systemImage: "camera.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .controlSize(.large)
                }
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label("Choose from Library", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
            }
        }
        .padding(MacroMetrics.pagePadding)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { handle($0) }.ignoresSafeArea()
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    handle(img)
                } else {
                    errorText = "Couldn't load that photo."
                }
                pickerItem = nil
            }
        }
        .alert("Photo problem", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorText ?? "") }
    }

    private func handle(_ image: UIImage) {
        if let data = ImagePrep.jpeg(from: image) { onImage(data) }
        else { errorText = "Couldn't prepare that photo." }
    }
}
