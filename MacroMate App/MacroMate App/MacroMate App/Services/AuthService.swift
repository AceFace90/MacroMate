import Foundation
import Observation
import Supabase

/// Sign in with Apple needs a paid Apple Developer Program account (capability + entitlement
/// `com.apple.developer.applesignin`). Set to true, re-add the entitlement to MacroMate.entitlements,
/// and enable the Apple provider in Supabase once the account exists. Guideline 4.8 requires it
/// whenever another third-party login (Google) is offered.
enum Features {
    static let signInWithApple = false
}

/// Signed-in account (from the Supabase session).
nonisolated struct AuthUser: Equatable, Sendable {
    let uid: String
    let email: String?
    let displayName: String?
    let photoURL: URL?
}

/// Supabase Google OAuth (PKCE via ASWebAuthenticationSession) + session restore.
@Observable
final class AuthService {
    private(set) var user: AuthUser?
    /// True until the stored session has been read for the first time.
    private(set) var initializing = true
    private(set) var isSigningIn = false

    @ObservationIgnored private var listener: Task<Void, Never>?
    /// Called on every auth change (including the first, restored one).
    @ObservationIgnored var onUserChange: ((AuthUser?) -> Void)?

    private var client: SupabaseClient { SupabaseConfig.client }

    /// Starts listening for auth state. Call once at launch.
    func start() {
        guard listener == nil else { return }
        listener = Task { [weak self] in
            // Always emits `.initialSession` first (the stored session, if any).
            for await (_, session) in SupabaseConfig.client.auth.authStateChanges {
                self?.apply(session)
            }
        }
    }

    private func apply(_ session: Session?) {
        let new = session.map { s -> AuthUser in
            let meta = s.user.userMetadata
            let name = meta["full_name"]?.stringValue ?? meta["name"]?.stringValue
            let photo = (meta["avatar_url"]?.stringValue ?? meta["picture"]?.stringValue).flatMap(URL.init(string:))
            return AuthUser(uid: s.user.id.uuidString.lowercased(), email: s.user.email, displayName: name, photoURL: photo)
        }
        let changed = new != user || initializing
        user = new
        initializing = false
        if changed { onUserChange?(new) }
    }

    func signInWithGoogle() async throws {
        isSigningIn = true
        defer { isSigningIn = false }
        try await client.auth.signInWithOAuth(provider: .google, redirectTo: SupabaseConfig.redirectURL)
    }

    func signInWithApple() async throws {
        isSigningIn = true
        defer { isSigningIn = false }
        try await client.auth.signInWithOAuth(provider: .apple, redirectTo: SupabaseConfig.redirectURL)
    }

    /// Deletes the user's cloud data and auth account (server-side `delete_my_account` function), then signs out locally.
    func deleteAccount() async throws {
        try await client.rpc("delete_my_account").execute()
        try? await client.auth.signOut(scope: .local)
    }

    func signOut() async throws {
        try await client.auth.signOut(scope: .local)
    }

    /// Forwards the `macromate://auth-callback` URL (fallback if the web auth session doesn't consume it).
    func handle(_ url: URL) { client.auth.handle(url) }
}
