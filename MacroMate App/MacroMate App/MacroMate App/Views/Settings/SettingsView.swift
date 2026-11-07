import SwiftUI

/// Settings tab: account, appearance, Apple Health, AI key, data export, about.
struct SettingsView: View {
    @Environment(AppStore.self) private var store

    @State private var confirmSignOut = false
    @State private var keyInput = ""
    @State private var keySaved = false

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = info?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        @Bindable var store = store
        List {
            accountSection
            Section("Appearance") {
                Picker("Theme", selection: $store.theme) {
                    ForEach(ThemePreference.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            healthSection
            aiSection
            dataSection
            aboutSection
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(MacroColor.canvas.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .onAppear { keyInput = store.geminiKey; store.ai.refreshAvailability() }
        .confirmationDialog("Sign out of MacroMate?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { Task { await store.signOut() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Synced data stays in your account. This device's cloud copy is cleared until you sign in again.")
        }
    }

    // MARK: Sections

    private var initials: String {
        let source = store.profile.name?.isEmpty == false ? store.profile.name! : (store.user?.displayName ?? store.user?.email ?? "")
        let parts = source.split(separator: " ").prefix(2).compactMap(\.first)
        let s = String(parts).uppercased()
        return s.isEmpty ? "M" : s
    }

    private var accountSection: some View {
        Section {
            HStack(spacing: 14) {
                Text(initials)
                    .font(.title2.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(MacroColor.calories.gradient, in: .circle)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.user?.displayName ?? store.profile.name ?? "MacroMate").font(.title3.weight(.bold))
                    Text(store.user?.email ?? "Stored on this device")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)

            if store.isSignedIn {
                Button("Sign Out", role: .destructive) { confirmSignOut = true }
            } else {
                Button { Task { await store.signIn() } } label: {
                    MacroLinkLabel(title: store.auth.isSigningIn ? "Signing in..." : "Sign in with Google",
                                   symbol: "person.crop.circle.badge.checkmark")
                }
                .disabled(store.auth.isSigningIn)
            }
        } header: {
            Text("Account")
        } footer: {
            Text(store.isSignedIn
                 ? "Your log and profile sync to this account across devices."
                 : "Sign in to sync your data across devices. Without an account everything stays on this device.")
        }
    }

    private var healthSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { store.healthEnabled },
                set: { store.healthEnabled = $0 })) {   // enabling triggers syncHealth(days: 7, requestAccess: true)
                Label("Apple Health", systemImage: "heart.fill").foregroundStyle(MacroColor.critical)
            }
            if store.healthEnabled {
                Button { Task { await store.syncHealth(days: 7, requestAccess: true) } } label: {
                    MacroLinkLabel(title: store.isSyncing ? "Syncing..." : "Sync now",
                                   symbol: "arrow.triangle.2.circlepath")
                }
                .disabled(store.isSyncing)
            }
        } header: {
            Text("Apple Health")
        } footer: {
            Text("Writes your daily calories, protein, carbs and fat to Apple Health, and reads your body weight so you can import it into your profile. You can turn this off at any time.")
        }
    }

    private var aiSection: some View {
        Section {
            LabeledContent("Active AI") {
                Text(store.ai.activeBackendName).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
            }
            if let detail = store.ai.availabilityDetail {
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
            SecureField("Gemini fallback (optional)", text: $keyInput)
                .textContentType(.password)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit(saveKey)
            Button(keySaved ? "Saved" : "Save Key", action: saveKey)
                .disabled(keyInput.trimmingCharacters(in: .whitespaces) == store.geminiKey && !keySaved)
            Link(destination: URL(string: "https://aistudio.google.com/apikey")!) {
                MacroLinkLabel(title: "Get a free key from Google AI Studio", symbol: "key.fill")
            }
        } header: {
            Text("AI Photo & Text Logging")
        } footer: {
            Text("On-device processing keeps photos on your iPhone. Apple Intelligence is tried first, then Private Cloud Compute. Gemini is used only if both are unavailable or fail, and only when you add a key. Your key stays in the Keychain, is never synced, and is sent only to Google's Gemini API.")
        }
    }

    private var dataSection: some View {
        Section("Data") {
            if let url = store.exportFileURL() {
                ShareLink(item: url, subject: Text("MacroMate export")) {
                    Label("Export Data (JSON)", systemImage: "square.and.arrow.up")
                }
            } else {
                Label("Export unavailable", systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
            }
        }
    }

    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: appVersion)
            LabeledContent("Food data") {
                Text("AFCD, OpenNutrition, Open Food Facts").multilineTextAlignment(.trailing)
            }
        } header: {
            Text("About")
        } footer: {
            Text("Calorie and macro targets are estimates (Mifflin-St Jeor) for general information, not medical advice.")
        }
    }

    private func saveKey() {
        store.geminiKey = keyInput
        keyInput = store.geminiKey
        keySaved = true
        Task { try? await Task.sleep(for: .seconds(2)); keySaved = false }
    }
}

#Preview {
    NavigationStack { SettingsView() }
        .environment(AppStore.preview)
        .environment(AppRouter())
}
