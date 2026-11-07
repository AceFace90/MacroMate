import Foundation
import HealthKit

/// Apple Health bridge. Writes each day's dietary totals as MacroMate-owned samples (tagged with
/// metadata, replaced per day, never touching other apps' data) and reads the latest body mass.
@MainActor
final class HealthKitService {
    private let store = HKHealthStore()
    private var authorised = false
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Metadata tag on every sample we write: the local day it summarises ("YYYY-MM-DD").
    private static let dayKey = "MacroMateDay"

    private var dietaryTypes: [(type: HKQuantityType, unit: HKUnit, value: (MacroTotals) -> Double)] {
        [(HKQuantityType(.dietaryEnergyConsumed), .kilocalorie(), { $0.calories }),
         (HKQuantityType(.dietaryProtein), .gram(), { $0.protein }),
         (HKQuantityType(.dietaryCarbohydrates), .gram(), { $0.carbs }),
         (HKQuantityType(.dietaryFatTotal), .gram(), { $0.fat })]
    }

    /// Requests write (dietary) + read (body mass) access. Safe to call repeatedly.
    func requestAuthorisation() async throws {
        guard isAvailable, !authorised else { return }
        let share = Set(dietaryTypes.map { $0.type as HKSampleType })
        try await store.requestAuthorization(toShare: share, read: [HKQuantityType(.bodyMass)])
        authorised = true
    }

    /// Replaces MacroMate's samples for `day` with the given totals. Deleting is limited to samples
    /// our own app saved for that day (HealthKit only lets an app delete its own samples anyway).
    func writeDay(_ day: String, totals: MacroTotals) async throws {
        guard isAvailable, let start = DateUtils.date(from: day) else { return }
        try await requestAuthorisation()

        for t in dietaryTypes {
            let mine = HKQuery.predicateForObjects(withMetadataKey: Self.dayKey, allowedValues: [day])
            let existing = (try? await HKSampleQueryDescriptor(
                predicates: [.quantitySample(type: t.type, predicate: mine)], sortDescriptors: [], limit: nil
            ).result(for: store)) ?? []
            let ours = existing.filter { $0.sourceRevision.source == HKSource.default() }
            if !ours.isEmpty { try await store.delete(ours) }
        }

        let end = Calendar.current.date(byAdding: .day, value: 1, to: start)?.addingTimeInterval(-1) ?? start
        let samples: [HKQuantitySample] = dietaryTypes.compactMap { t in
            let v = t.value(totals)
            guard v > 0 else { return nil }
            return HKQuantitySample(type: t.type, quantity: HKQuantity(unit: t.unit, doubleValue: v),
                                    start: start, end: end, metadata: [Self.dayKey: day])
        }
        if !samples.isEmpty { try await store.save(samples) }
    }

    /// Most recent body mass reading (kg) and its date.
    func latestBodyMass() async -> (kg: Double, date: Date)? {
        guard isAvailable else { return nil }
        try? await requestAuthorisation()
        let d = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.bodyMass))],
            sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)], limit: 1)
        guard let s = (try? await d.result(for: store))?.first else { return nil }
        return (s.quantity.doubleValue(for: .gramUnit(with: .kilo)), s.startDate)
    }

    /// Body mass readings over the last `days` days, oldest first (Trends weight chart).
    func bodyMassHistory(days: Int) async -> [(date: Date, kg: Double)] {
        guard isAvailable else { return [] }
        try? await requestAuthorisation()
        let since = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let pred = HKQuery.predicateForSamples(withStart: since, end: nil)
        let d = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.bodyMass), predicate: pred)],
            sortDescriptors: [SortDescriptor(\.startDate)], limit: nil)
        let samples = (try? await d.result(for: store)) ?? []
        return samples.map { ($0.startDate, $0.quantity.doubleValue(for: .gramUnit(with: .kilo))) }
    }
}
