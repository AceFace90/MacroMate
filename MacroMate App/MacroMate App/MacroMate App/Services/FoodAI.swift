import Foundation
import Observation
import FoundationModels
import Vision
import UIKit

// MARK: - Generable schemas (Apple models)

@Generable(description: "Nutrition estimate for one food in the quantity described.")
struct FoodEstimateGen {
    @Guide(description: "Short food name, e.g. 'grilled chicken breast'")
    var name: String
    @Guide(description: "Total kilocalories for the quantity described (not per 100 g)")
    var calories: Double
    @Guide(description: "Protein in grams for the quantity described")
    var proteinG: Double
    @Guide(description: "Carbohydrate in grams for the quantity described")
    var carbsG: Double
    @Guide(description: "Fat in grams for the quantity described")
    var fatG: Double
    @Guide(description: "Fibre in grams for the quantity described, 0 if none")
    var fiberG: Double
    @Guide(description: "Weight in grams of the quantity described, 100 if unspecified")
    var quantityG: Double
    @Guide(description: "Confidence 0-100; lower if uncertain")
    var confidence: Double
}

@Generable(description: "A single food item visible in a meal.")
struct MealItemGen {
    @Guide(description: "Generic food name, no brand names, e.g. 'rice white cooked'")
    var name: String
    @Guide(description: "Estimated realistic portion size, in the given unit")
    var quantity: Double
    @Guide(description: "Unit of the quantity", .anyOf(["g", "ml", "cup", "tbsp", "tsp", "piece", "slice"]))
    var unit: String
}

@Generable(description: "All food items identified in a meal.")
struct MealItemsGen {
    @Guide(description: "Every visible food item with an estimated portion")
    var items: [MealItemGen]
}

@Generable(description: "Nutrition facts read from a food label, per serving.")
struct LabelGen {
    @Guide(description: "Product name or description")
    var name: String
    @Guide(description: "Serving size as printed, e.g. '1 cup (240ml)'")
    var servingSizeDisplay: String
    @Guide(description: "Serving size in grams or ml; convert other units (1 cup ~ 240, 1 oz ~ 28); 0 if unknown")
    var servingSizeG: Double
    @Guide(description: "Calories PER SERVING")
    var calories: Double
    @Guide(description: "Protein grams per serving, 0 if not shown")
    var proteinG: Double
    @Guide(description: "Carbohydrate grams per serving, 0 if not shown")
    var carbsG: Double
    @Guide(description: "Fat grams per serving, 0 if not shown")
    var fatG: Double
    @Guide(description: "Fibre grams per serving, 0 if not shown")
    var fiberG: Double
    @Guide(description: "Sodium milligrams per serving, 0 if not shown")
    var sodiumMg: Double
    @Guide(description: "Sugar grams per serving, 0 if not shown")
    var sugarG: Double
    @Guide(description: "Confidence 0-100 based on label text clarity")
    var confidence: Double
}

// MARK: - FoodAI

/// One AI layer: Apple on-device model, then Private Cloud Compute, then Gemini (if a key is set).
@Observable
@MainActor
final class FoodAI {
    enum Backend: Equatable { case onDevice, privateCloud, gemini }

    enum AIError: LocalizedError {
        case unavailable
        case failed(String)
        var errorDescription: String? {
            switch self {
            case .unavailable:
                "Apple Intelligence isn't available on this device. Add a Gemini key in Settings as a fallback."
            case .failed(let m):
                "The AI couldn't complete this request (\(m)). Please try again."
            }
        }
    }

    @ObservationIgnored private let geminiKey: () -> String
    @ObservationIgnored private let onDeviceModel = SystemLanguageModel.default
    @ObservationIgnored private let cloudModel = PrivateCloudComputeLanguageModel()

    private(set) var onDeviceAvailability: SystemLanguageModel.Availability
    private(set) var cloudAvailability: PrivateCloudComputeLanguageModel.Availability

    init(geminiKey: @escaping () -> String) {
        self.geminiKey = geminiKey
        onDeviceAvailability = SystemLanguageModel.default.availability
        cloudAvailability = PrivateCloudComputeLanguageModel().availability
    }

    func refreshAvailability() {
        onDeviceAvailability = onDeviceModel.availability
        cloudAvailability = cloudModel.availability
    }

    private var hasGemini: Bool { !geminiKey().trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var onDeviceUsable: Bool { onDeviceAvailability == .available }
    private var cloudUsable: Bool { cloudAvailability == .available }

    var isAvailable: Bool { onDeviceUsable || cloudUsable || hasGemini }

    /// First usable backend, for Settings.
    var activeBackend: Backend? {
        if onDeviceUsable { return .onDevice }
        if cloudUsable { return .privateCloud }
        if hasGemini { return .gemini }
        return nil
    }

    var activeBackendName: String {
        switch activeBackend {
        case .onDevice: "On-device \u{B7} Apple Intelligence"
        case .privateCloud: "Private Cloud Compute"
        case .gemini: "Gemini"
        case nil: "Not available"
        }
    }

    /// Why Apple Intelligence isn't usable (nil when the on-device model is available).
    var availabilityDetail: String? {
        if onDeviceUsable { return nil }
        let reason: String
        switch onDeviceAvailability {
        case .available: return nil
        case .unavailable(.deviceNotEligible): reason = "This device doesn't support Apple Intelligence."
        case .unavailable(.appleIntelligenceNotEnabled): reason = "Apple Intelligence is turned off in Settings."
        case .unavailable(.modelNotReady): reason = "The on-device model is still downloading."
        case .unavailable: reason = "The on-device model is unavailable."
        }
        if cloudUsable { return reason + " Using Private Cloud Compute instead." }
        if hasGemini { return reason + " Using your Gemini key instead." }
        return reason
    }

    // MARK: Instructions (ported from GeminiService prompts)

    private static let foodInstructions = """
    You are a nutrition database. Estimate the nutritional content of the food the user describes.
    Rules:
    - Values are for the quantity described (not per 100g)
    - confidence is 0-100 (lower if uncertain)
    """

    private static let mealInstructions = """
    You are a nutrition assistant. The image shows a meal or plate of food. Identify all visible food items and estimate realistic portion sizes.
    Rules:
    - Use generic food names (not brand names)
    - Estimate realistic portions based on visual size
    - unit must be one of: g, ml, cup, tbsp, tsp, piece, slice
    """

    private static let labelInstructions = """
    You are a nutrition label reader. Extract the nutrition information from the food nutrition label.
    Rules:
    - Values must be PER SERVING (the serving size shown on the label)
    - servingSizeG: convert to grams/ml if given in other units (1 cup ~ 240, 1 oz ~ 28)
    - confidence is 0-100 based on label clarity
    - If a nutrient is not shown, use 0
    """

    // MARK: Public API

    func analyzeFood(_ text: String) async throws -> GeminiService.FoodEstimate {
        let prompt = "Food: \"\(text)\""
        var lastError: Error?
        for backend in textBackends() {
            do {
                switch backend {
                case .onDevice: return try Self.map(try await generate(onDeviceModel, Self.foodInstructions, FoodEstimateGen.self) { prompt })
                case .privateCloud: return try Self.map(try await generate(cloudModel, Self.foodInstructions, FoodEstimateGen.self) { prompt })
                case .gemini: return try Self.validate(try await GeminiService().analyzeFood(text, key: geminiKey()))
                }
            } catch { lastError = error }
        }
        throw finalError(lastError)
    }

    func analyzeMealPhoto(_ jpeg: Data) async throws -> [GeminiService.MealPhotoItem] {
        var lastError: Error?
        if let cg = Self.cgImage(jpeg) {
            for backend in visionBackends() {
                do {
                    switch backend {
                    case .onDevice: return try Self.map(try await generate(onDeviceModel, Self.mealInstructions, MealItemsGen.self) {
                        "Identify the food items in this meal photo."; Attachment(cg) })
                    case .privateCloud: return try Self.map(try await generate(cloudModel, Self.mealInstructions, MealItemsGen.self) {
                        "Identify the food items in this meal photo."; Attachment(cg) })
                    case .gemini: break
                    }
                } catch { lastError = error }
            }
        }
        if hasGemini {
            do {
                let items = try await GeminiService().analyzeMealPhoto(jpeg, key: geminiKey())
                guard !items.isEmpty else { throw GeminiService.GeminiError.parse }
                return items
            } catch { lastError = error }
        }
        throw finalError(lastError)
    }

    func analyzeLabel(_ jpeg: Data) async throws -> GeminiService.LabelResult {
        var lastError: Error?
        let ocr = await Self.recognizeText(jpeg)
        if !ocr.isEmpty {
            let prompt = "Text recognised from a nutrition label:\n\(ocr)"
            for backend in textBackends() where backend != .gemini {
                do {
                    if backend == .onDevice {
                        return try Self.map(try await generate(onDeviceModel, Self.labelInstructions, LabelGen.self) { prompt })
                    } else {
                        return try Self.map(try await generate(cloudModel, Self.labelInstructions, LabelGen.self) { prompt })
                    }
                } catch { lastError = error }
            }
        } else if let cg = Self.cgImage(jpeg) {
            // No readable text: fall back to image-capable models.
            for backend in visionBackends() {
                do {
                    if backend == .onDevice {
                        return try Self.map(try await generate(onDeviceModel, Self.labelInstructions, LabelGen.self) {
                            "Read this nutrition label."; Attachment(cg) })
                    } else if backend == .privateCloud {
                        return try Self.map(try await generate(cloudModel, Self.labelInstructions, LabelGen.self) {
                            "Read this nutrition label."; Attachment(cg) })
                    }
                } catch { lastError = error }
            }
        }
        if hasGemini {
            do { return try Self.validate(try await GeminiService().analyzeLabel(jpeg, key: geminiKey())) }
            catch { lastError = error }
        }
        throw finalError(lastError)
    }

    // MARK: Backend selection

    private func textBackends() -> [Backend] {
        var b: [Backend] = []
        if onDeviceUsable { b.append(.onDevice) }
        if cloudUsable { b.append(.privateCloud) }
        if hasGemini { b.append(.gemini) }
        return b
    }

    /// Apple backends that are usable and image-capable (Gemini is handled separately).
    private func visionBackends() -> [Backend] {
        var b: [Backend] = []
        if onDeviceUsable, onDeviceModel.capabilities.contains(.vision) { b.append(.onDevice) }
        if cloudUsable, cloudModel.capabilities.contains(.vision) { b.append(.privateCloud) }
        return b
    }

    private func finalError(_ last: Error?) -> Error {
        guard let last else { return AIError.unavailable }
        if let l = last as? LocalizedError, let d = l.errorDescription, last is GeminiService.GeminiError { return AIError.failed(d) }
        return AIError.failed(last.localizedDescription)
    }

    // MARK: Generation

    private func generate<M: LanguageModel, T: Generable>(
        _ model: M, _ instructions: String, _ type: T.Type,
        @PromptBuilder prompt: () throws -> Prompt
    ) async throws -> T {
        let session = LanguageModelSession(model: model, tools: [], instructions: instructions)
        return try await session.respond(generating: type, prompt: prompt).content
    }

    // MARK: Mapping + validation

    private static func validate(_ e: GeminiService.FoodEstimate) throws -> GeminiService.FoodEstimate {
        guard !e.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, e.calories.isFinite, e.calories >= 0
        else { throw GeminiService.GeminiError.parse }
        return e
    }

    private static func validate(_ r: GeminiService.LabelResult) throws -> GeminiService.LabelResult {
        guard r.calories.isFinite, r.calories >= 0 else { throw GeminiService.GeminiError.parse }
        return r
    }

    private static func map(_ g: FoodEstimateGen) throws -> GeminiService.FoodEstimate {
        let name = g.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, g.calories.isFinite, g.calories >= 0 else { throw GeminiService.GeminiError.parse }
        func nn(_ v: Double) -> Double { v.isFinite ? max(0, v) : 0 }
        return GeminiService.FoodEstimate(name: name, calories: g.calories, proteinG: nn(g.proteinG),
                                          carbsG: nn(g.carbsG), fatG: nn(g.fatG), fiberG: nn(g.fiberG),
                                          quantityG: g.quantityG.isFinite && g.quantityG > 0 ? g.quantityG : 100,
                                          confidence: g.confidence)
    }

    private static func map(_ g: MealItemsGen) throws -> [GeminiService.MealPhotoItem] {
        let units = ["g", "ml", "cup", "tbsp", "tsp", "piece", "slice"]
        let items: [GeminiService.MealPhotoItem] = g.items.compactMap {
            let name = $0.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, $0.quantity.isFinite, $0.quantity > 0 else { return nil }
            return .init(name: name, quantity: $0.quantity, unit: units.contains($0.unit) ? $0.unit : "g")
        }
        guard !items.isEmpty else { throw GeminiService.GeminiError.parse }
        return items
    }

    private static func map(_ g: LabelGen) throws -> GeminiService.LabelResult {
        guard g.calories.isFinite, g.calories >= 0 else { throw GeminiService.GeminiError.parse }
        func nn(_ v: Double) -> Double { v.isFinite ? max(0, v) : 0 }
        let name = g.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let disp = g.servingSizeDisplay.trimmingCharacters(in: .whitespacesAndNewlines)
        return GeminiService.LabelResult(name: name.isEmpty ? "Scanned item" : name, calories: g.calories,
                                         proteinG: nn(g.proteinG), carbsG: nn(g.carbsG), fatG: nn(g.fatG),
                                         fiberG: nn(g.fiberG), sodiumMg: nn(g.sodiumMg), sugarG: nn(g.sugarG),
                                         servingSizeG: g.servingSizeG.isFinite && g.servingSizeG > 0 ? g.servingSizeG : nil,
                                         servingSizeDisplay: disp.isEmpty ? nil : disp, confidence: g.confidence)
    }

    // MARK: Images + OCR

    private static func cgImage(_ jpeg: Data) -> CGImage? { UIImage(data: jpeg)?.cgImage }

    /// Accurate on-device OCR; returns recognised lines joined by newlines (empty if none).
    @concurrent
    nonisolated private static func recognizeText(_ jpeg: Data) async -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let handler = VNImageRequestHandler(data: jpeg)
        guard (try? handler.perform([request])) != nil else { return "" }
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
