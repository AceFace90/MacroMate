import SwiftUI

/// App-wide navigation state shared with the tabs.
@Observable
@MainActor
final class AppRouter {
    var showAddFood = false
    /// Date key the Add Food sheet logs into (Today sets it before presenting).
    var selectedDate: String = DateUtils.todayStr()
    /// Meal the Add Food sheet preselects (nil = suggest from time of day).
    var selectedMeal: MealType?
    var tab: AppTab = .today

    func presentAddFood(for date: String = DateUtils.todayStr(), meal: MealType? = nil) {
        selectedDate = date
        selectedMeal = meal
        showAddFood = true
    }
}

enum AppTab: Hashable { case today, trends, profile, settings }

struct RootView: View {
    @Environment(AppStore.self) private var store
    @State private var router = AppRouter()

    var body: some View {
        @Bindable var store = store
        @Bindable var router = router
        ZStack {
            if store.showsSplash {
                SplashView()
            } else {
                TabView(selection: $router.tab) {
                    Tab("Today", systemImage: "fork.knife.circle.fill", value: AppTab.today) {
                        NavigationStack {
                            TodayView()
                        }
                    }
                    Tab("Trends", systemImage: "chart.xyaxis.line", value: AppTab.trends) {
                        NavigationStack { TrendsView() }
                    }
                    Tab("Profile", systemImage: "person.crop.circle.fill", value: AppTab.profile) {
                        NavigationStack { ProfileView() }
                    }
                    Tab("Settings", systemImage: "gearshape.fill", value: AppTab.settings) {
                        NavigationStack { SettingsView() }
                    }
                }
                .tabBarMinimizeBehavior(.onScrollDown)
                .sheet(isPresented: $router.showAddFood) { AddFoodView(date: router.selectedDate) }
            }
        }
        .environment(router)
        .tint(MacroColor.calories)
        .alert("MacroMate", isPresented: Binding(get: { store.errorMessage != nil },
                                                 set: { if !$0 { store.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}

#Preview {
    RootView().environment(AppStore.preview)
}
