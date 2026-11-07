import React from 'react';
import { Platform, TouchableOpacity, useWindowDimensions } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography, fontFamily, breakpoints } from '../theme';
import Icon from '../components/Icon';

import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProgressScreen from '../screens/ProgressScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FoodHistoryScreen from '../screens/FoodHistoryScreen';

// Tabs mirror the native iOS app: Today / Trends / Profile / Settings.
// Phone: bottom tab bar (frosted glass). Tablet: same, wider content column.
// Desktop (≥1100px): the tab bar moves to a left sidebar, like LabMate's web layout.

const Tab = createBottomTabNavigator();
const TodayStack = createStackNavigator();

const TABS = {
  Today: { icon: 'forkKnife', label: 'Today' },
  Trends: { icon: 'chart', label: 'Trends' },
  Profile: { icon: 'person', label: 'Profile' },
  Settings: { icon: 'gear', label: 'Settings' },
};

function TodayStackNav() {
  const { theme } = useTheme();
  return (
    <TodayStack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: theme.bg, borderBottomWidth: 0, shadowOpacity: 0, elevation: 0 },
        headerShadowVisible: false,
        headerTintColor: theme.accent,
        headerTitleStyle: { color: theme.text, fontWeight: '600', fontSize: typography.sizes.lg, fontFamily },
        cardStyle: { backgroundColor: theme.bg },
        headerLeft: navigation.canGoBack()
          ? () => (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ marginLeft: spacing[3] }}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Icon name="chevronLeft" size={22} color={theme.accent} />
              </TouchableOpacity>
            )
          : undefined,
      })}
    >
      <TodayStack.Screen name="TodayMain" component={HomeScreen} options={{ headerShown: false }} />
      <TodayStack.Screen name="FoodHistory" component={FoodHistoryScreen} options={{ title: 'Food History' }} />
    </TodayStack.Navigator>
  );
}

// Dev-only: ?tab=Trends|Profile|Settings opens that tab (for screenshots / quick checks).
const DEV_TAB = (() => {
  if (!__DEV__ || typeof window === 'undefined') return undefined;
  const t = new URLSearchParams(window.location?.search || '').get('tab');
  return t && TABS[t] ? t : undefined;
})();

export default function AppNavigator({ session, targets, onTargetsChange }) {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= breakpoints.desktop;

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: theme.bg, card: theme.card, border: theme.border, primary: theme.accent, text: theme.text },
  };

  const glass = Platform.OS === 'web'
    ? { backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }
    : null;

  const tabBarStyle = desktop
    ? {
        width: 232,
        backgroundColor: theme.card,
        borderRightColor: theme.border,
        borderRightWidth: 1,
        paddingTop: spacing[6],
        paddingHorizontal: spacing[3],
      }
    : {
        position: 'absolute',
        backgroundColor: theme.glass,
        borderTopColor: theme.border,
        borderTopWidth: 0.5,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
        ...glass,
      };

  return (
    <NavigationContainer theme={navTheme} linking={{ enabled: false }}>
      <Tab.Navigator
        initialRouteName={DEV_TAB}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarPosition: desktop ? 'left' : 'bottom',
          tabBarVariant: 'uikit',
          tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
          tabBarStyle,
          tabBarItemStyle: desktop ? { borderRadius: 10, height: 44, justifyContent: 'flex-start', paddingHorizontal: spacing[3] } : undefined,
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarActiveBackgroundColor: desktop ? theme.accentBg : undefined,
          tabBarLabel: TABS[route.name]?.label,
          tabBarLabelStyle: desktop
            ? { fontSize: typography.sizes.base, fontWeight: '600', fontFamily, marginLeft: spacing[3] }
            : { fontSize: 10, fontWeight: '600', fontFamily },
          tabBarIcon: ({ color }) => <Icon name={TABS[route.name]?.icon} size={desktop ? 20 : 24} color={color} />,
          sceneStyle: { backgroundColor: theme.bg },
        })}
      >
        <Tab.Screen name="Today" component={TodayStackNav} />
        <Tab.Screen name="Trends" component={ProgressScreen} />
        <Tab.Screen name="Profile">
          {(props) => <ProfileScreen {...props} session={session} onTargetsChange={onTargetsChange} />}
        </Tab.Screen>
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
