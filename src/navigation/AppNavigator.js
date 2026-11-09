import React from 'react';
import { Platform, View, Text, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
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

// Floating pill tab bar (phone / tablet), like LabMate: spans the window width, inset items, pill-shaped highlight.
function FloatingTabBar({ state, descriptors, navigation }) {
  const { theme, isDark } = useTheme();
  const glass = Platform.OS === 'web'
    ? { backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }
    : null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          width: '100%',
          padding: 6,
          borderRadius: 999,
          backgroundColor: theme.glass,
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.4 : 0.12,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
          ...glass,
        }}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const tab = TABS[route.name];
          const color = focused ? theme.accent : theme.textSecondary;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel ?? tab?.label}
              style={{
                flex: 1,
                height: 60,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                backgroundColor: focused ? theme.accentBg : 'transparent',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
              }}
            >
              <Icon name={tab?.icon} size={24} color={color} />
              <Text style={{ fontSize: 11, fontWeight: '600', color, fontFamily }}>{tab?.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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

  const tabBarStyle = desktop
    ? {
        // Floating rounded card, like LabMate's sidebar
        width: 248,
        margin: 12,
        backgroundColor: theme.card,
        borderRadius: 26,
        borderWidth: 0,
        borderRightWidth: 0,
        paddingTop: 64,
        paddingHorizontal: 10,
      }
    : undefined;

  return (
    <View style={{ flex: 1 }}>
    <NavigationContainer theme={navTheme} linking={{ enabled: false }}>
      <Tab.Navigator
        initialRouteName={DEV_TAB}
        tabBar={desktop ? undefined : (props) => <FloatingTabBar {...props} />}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarPosition: desktop ? 'left' : 'bottom',
          tabBarVariant: 'uikit',
          tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
          tabBarStyle,
          tabBarItemStyle: desktop
            ? { borderRadius: 12, height: 44, marginBottom: 2, justifyContent: 'flex-start', paddingHorizontal: 12 }
            : undefined,
          tabBarActiveTintColor: desktop ? theme.accentContrast : theme.accent,
          tabBarInactiveTintColor: desktop ? theme.text : theme.textSecondary,
          tabBarActiveBackgroundColor: desktop ? theme.accent : undefined,
          tabBarLabel: TABS[route.name]?.label,
          tabBarLabelStyle: desktop
            ? { fontSize: 15, fontWeight: '500', fontFamily, marginLeft: 12 }
            : { fontSize: 10, fontWeight: '600', fontFamily },
          tabBarIcon: ({ color, focused }) => <Icon name={TABS[route.name]?.icon} size={desktop ? 20 : 24} color={desktop && !focused ? theme.accent : color} />,
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
    {desktop ? (
      <Text
        pointerEvents="none"
        style={{ position: 'absolute', top: 32, left: 34, fontSize: 22, fontWeight: '700', color: theme.text, fontFamily }}
      >MacroMate</Text>
    ) : null}
    </View>
  );
}
