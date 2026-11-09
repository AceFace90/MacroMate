import SwiftUI

/// Signed-out first launch: sign in with Google or continue locally.
struct SplashView: View {
    @Environment(AppStore.self) private var store

    private let features: [(symbol: String, color: Color, text: String)] = [
        ("flame.fill", MacroColor.calories, "Track calories and macros against goals built from your profile"),
        ("camera.fill", MacroColor.protein, "Snap a photo of a meal and let AI estimate it"),
        ("magnifyingglass", MacroColor.carbs, "Search AFCD, OpenNutrition and Open Food Facts"),
        ("heart.fill", MacroColor.critical, "Sync daily totals with Apple Health"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image("AppLogo").resizable().scaledToFit().frame(width: 110, height: 110)
                    .clipShape(.rect(cornerRadius: 26, style: .continuous))
                    .padding(.top, 40)
                    .accessibilityHidden(true)
                Text("MacroMate").macroHeadline()
                Text("Track calories and macros. Your data stays on your device unless you sign in.")
                    .macroNarrative().multilineTextAlignment(.center)

                MacroCard {
                    ForEach(features, id: \.text) { f in
                        HStack(spacing: 14) {
                            Image(systemName: f.symbol).font(.title3).foregroundStyle(f.color).frame(width: 30)
                            Text(f.text).font(.subheadline)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(MacroMetrics.pagePadding)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) {
                if Features.signInWithApple {
                    Button { Task { await store.signInWithApple() } } label: {
                        Label("Sign in with Apple", systemImage: "apple.logo").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(.primary).controlSize(.large).disabled(store.auth.isSigningIn)
                }
                Button { Task { await store.signIn() } } label: {
                    Text(store.auth.isSigningIn ? "Signing in..." : "Sign in with Google").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(MacroColor.calories).controlSize(.large).disabled(store.auth.isSigningIn)
                Button("Continue without an account") { store.continueWithoutAccount() }
                    .controlSize(.large)
            }
            .padding(.horizontal, MacroMetrics.pagePadding)
            .padding(.bottom, 8)
        }
        .background(MacroColor.canvas.ignoresSafeArea())
    }
}

#Preview { SplashView().environment(AppStore.preview) }
