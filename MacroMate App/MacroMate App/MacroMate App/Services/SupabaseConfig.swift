import Foundation
import Supabase

/// Shared Supabase client. The publishable key is safe to ship: row-level security protects data.
/// Never put an `sb_secret_*` key here.
nonisolated enum SupabaseConfig {
    static let url = URL(string: "https://vzcmeubfdjdwqhxihusw.supabase.co")!
    static let publishableKey = "sb_publishable_HE9bJbtQHMvmO1S0nHZ_-g_qoNFDskA"
    /// Must be in the Supabase Auth redirect allowlist and match the URL scheme in MacroMate-Info.plist.
    static let redirectURL = URL(string: "macromate://auth-callback")!

    static let client = SupabaseClient(
        supabaseURL: url,
        supabaseKey: publishableKey,
        options: SupabaseClientOptions(
            // Emit the stored session at launch (even if expired) so cached data paints offline.
            auth: .init(redirectToURL: redirectURL, emitLocalSessionAsInitialSession: true)
        )
    )
}
