import SwiftUI

@main
struct MacroMateApp: App {
    @State private var store = AppStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(store.theme.colorScheme)
                .task { store.start() }
                // Completes the OAuth redirect (macromate://auth-callback).
                .onOpenURL { store.handle($0) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            // Apple Intelligence may have finished downloading or been toggled while away.
            store.ai.refreshAvailability()
            // Refresh from the cloud when returning to the app.
            if store.isSignedIn { Task { await store.sync() } }
        }
    }
}
