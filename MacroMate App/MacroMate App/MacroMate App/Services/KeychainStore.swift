import Foundation
import Security

/// Minimal Keychain wrapper for secrets that must never sync (the user's Gemini API key).
nonisolated enum KeychainStore {
    private static let service = "com.wallacecorreypersonalteam.MacroMateApp"
    static let geminiAccount = "gemini-api-key"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func get(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Empty / nil removes the item.
    static func set(_ value: String?, for account: String) {
        SecItemDelete(query(account) as CFDictionary)
        guard let value, !value.isEmpty, let data = value.data(using: .utf8) else { return }
        var q = query(account)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static var geminiKey: String? {
        get { get(geminiAccount) }
        set { set(newValue, for: geminiAccount) }
    }
}
