import Foundation
import Supabase

/// food_logs + profiles CRUD against Supabase. Compatible with the web app's rows.
nonisolated struct CloudStore {
    private var client: SupabaseClient { SupabaseConfig.client }

    /// One `food_logs` row: a FoodEntry plus user_id / logged_date.
    nonisolated struct FoodLogRow: Codable {
        var entry: FoodEntry
        var userId: String
        var loggedDate: String

        private enum Extra: String, CodingKey { case userId = "user_id", loggedDate = "logged_date" }

        init(entry: FoodEntry, userId: String, loggedDate: String) {
            self.entry = entry; self.userId = userId; self.loggedDate = loggedDate
        }
        init(from decoder: Decoder) throws {
            entry = try FoodEntry(from: decoder)
            let c = try decoder.container(keyedBy: Extra.self)
            userId = (try? c.decode(String.self, forKey: .userId)) ?? ""
            loggedDate = try c.decode(String.self, forKey: .loggedDate)
        }
        func encode(to encoder: Encoder) throws {
            try entry.encode(to: encoder)
            var c = encoder.container(keyedBy: Extra.self)
            try c.encode(userId, forKey: .userId)
            try c.encode(loggedDate, forKey: .loggedDate)
        }
    }

    /// `profiles` upsert payload: profile columns + id + updated_at.
    private nonisolated struct ProfileRow: Encodable {
        var id: String
        var profile: Profile
        private enum Extra: String, CodingKey { case id, updatedAt = "updated_at" }
        func encode(to encoder: Encoder) throws {
            try profile.encode(to: encoder)
            var c = encoder.container(keyedBy: Extra.self)
            try c.encode(id, forKey: .id)
            try c.encode(Date(), forKey: .updatedAt)
        }
    }

    /// Last `days` days of logs grouped by local date key (nil dates never occur: logged_date is not null).
    func fetchLogs(userId: String, days: Int = 90) async throws -> [String: [FoodEntry]] {
        let since = DateUtils.addDays(DateUtils.todayStr(), -days)
        let rows: [FoodLogRow] = try await client.from("food_logs")
            .select()
            .eq("user_id", value: userId)
            .gte("logged_date", value: since)
            .order("logged_at", ascending: true)
            .execute()
            .value
        var byDate: [String: [FoodEntry]] = [:]
        for r in rows { byDate[r.loggedDate, default: []].append(r.entry) }
        return byDate
    }

    func upsert(_ entry: FoodEntry, date: String, userId: String) async throws {
        try await client.from("food_logs")
            .upsert(FoodLogRow(entry: entry, userId: userId, loggedDate: date), returning: .minimal)
            .execute()
    }

    func delete(id: String) async throws {
        try await client.from("food_logs").delete(returning: .minimal).eq("id", value: id).execute()
    }

    /// The user's profile row, or nil if none exists yet.
    func fetchProfile(userId: String) async throws -> Profile? {
        let rows: [Profile] = try await client.from("profiles")
            .select()
            .eq("id", value: userId)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    func saveProfile(_ profile: Profile, userId: String) async throws {
        try await client.from("profiles")
            .upsert(ProfileRow(id: userId, profile: profile), onConflict: "id", returning: .minimal)
            .execute()
    }
}
