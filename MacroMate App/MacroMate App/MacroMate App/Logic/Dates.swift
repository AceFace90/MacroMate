import Foundation

// Port of the date helpers in src/store/logStore.js. Dates are local "YYYY-MM-DD" keys
// (NOT UTC), matching how food_logs.logged_date is written by the web app.

nonisolated enum DateUtils {
    private static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    /// "YYYY-MM-DD" for a Date in the local time zone.
    static func key(for date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    static func todayStr() -> String { key(for: Date()) }

    /// Local midnight of a "YYYY-MM-DD" key (nil if malformed).
    static func date(from key: String) -> Date? {
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    /// Timestamp for a log entry on `date`: the real moment for today (keeps intra-day order),
    /// local noon for a back-dated day so it never reads as "today".
    static func loggedAtFor(_ date: String) -> Date {
        if date == todayStr() { return Date() }
        guard let d = self.date(from: date) else { return Date() }
        return calendar.date(bySettingHour: 12, minute: 0, second: 0, of: d) ?? d
    }

    /// The last `n` local days, today first (`getPreviousDays`).
    static func previousDays(_ n: Int) -> [String] {
        let today = Date()
        return (0..<max(0, n)).compactMap { i in
            calendar.date(byAdding: .day, value: -i, to: today).map(key(for:))
        }
    }

    /// `key` shifted by `days` (negative = earlier). Returns `key` unchanged if malformed.
    static func addDays(_ key: String, _ days: Int) -> String {
        guard let d = date(from: key), let n = calendar.date(byAdding: .day, value: days, to: d) else { return key }
        return self.key(for: n)
    }

    static func daysBetween(_ a: String, _ b: String) -> Int {
        guard let da = date(from: a), let db = date(from: b) else { return 0 }
        return calendar.dateComponents([.day], from: da, to: db).day ?? 0
    }

    static func isToday(_ key: String) -> Bool { key == todayStr() }

    /// "Today" / "Yesterday" / "Tomorrow" / "Mon, 3 Nov".
    static func title(for key: String) -> String {
        switch daysBetween(todayStr(), key) {
        case 0: return "Today"
        case -1: return "Yesterday"
        case 1: return "Tomorrow"
        default: return longLabel(key)
        }
    }

    /// "Mon, 3 Nov"
    static func longLabel(_ key: String) -> String {
        guard let d = date(from: key) else { return key }
        return d.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    /// "3 Nov"
    static func shortLabel(_ key: String) -> String {
        guard let d = date(from: key) else { return key }
        return d.formatted(.dateTime.day().month(.abbreviated))
    }
}
