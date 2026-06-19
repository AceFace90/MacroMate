import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';

import DashboardScreen from '../screens/DashboardScreen';
import FoodSearchScreen from '../screens/FoodSearchScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProgressScreen from '../screens/ProgressScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();
const ProfileStack = createStackNavigator();

function stackOptions(theme) {
  return {
    headerStyle: { backgroundColor: theme.bg },
    headerTintColor: theme.accent,
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.bg },
    headerTitleStyle: { color: theme.accent, fontWeight: '700' },
  };
}

function DashboardStack({ session }) {
  const { theme } = useTheme();
  return (
    <HomeStack.Navigator screenOptions={stackOptions(theme)}>
      <HomeStack.Screen name="Dashboard" options={{ headerShown: false }}>
        {(props) => <DashboardScreen {...props} session={session} />}
      </HomeStack.Screen>
      <HomeStack.Screen name="FoodSearch" component={FoodSearchScreen} options={{ headerShown: false }} />
    </HomeStack.Navigator>
  );
}

function ProfileStackNav({ session, onTargetsChange }) {
  const { theme } = useTheme();
  return (
    <ProfileStack.Navigator screenOptions={stackOptions(theme)}>
      <ProfileStack.Screen name="ProfileMain" options={{ headerShown: false }}>
        {(props) => <ProfileScreen {...props} session={session} onTargetsChange={onTargetsChange} />}
      </ProfileStack.Screen>
      <ProfileStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </ProfileStack.Navigator>
  );
}

export default function AppNavigator({ session, targets, onTargetsChange }) {
  const { theme, isDark } = useTheme();

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: theme.bg, card: theme.card, border: theme.border, primary: theme.accent },
  };

  const TAB_ICONS = { Home: '🍽️', Progress: '📊', Profile: '👤' };

  return (
    <NavigationContainer theme={navTheme} linking={{ enabled: false }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarLabelStyle: { fontSize: typography.sizes.xs, fontWeight: '600' },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{TAB_ICONS[route.name] || '●'}</Text>
          ),
        })}
      >
        <Tab.Screen name="Home">
          {(props) => <DashboardStack {...props} session={session} />}
        </Tab.Screen>
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="Profile">
          {(props) => <ProfileStackNav {...props} session={session} onTargetsChange={onTargetsChange} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
