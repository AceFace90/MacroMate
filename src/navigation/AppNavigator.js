import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack'; // still used by ProfileStack
import { useTheme } from '../hooks/useTheme';
import { spacing, typography } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProgressScreen from '../screens/ProgressScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FoodHistoryScreen from '../screens/FoodHistoryScreen';

const Tab = createBottomTabNavigator();
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

function GearIcon({ color, size = 24 }) {
  // Ionicons "settings-outline" path, viewBox 0 0 512 512
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Path
        d="M262.29 192.31a64 64 0 1057.4 57.4 64.13 64.13 0 00-57.4-57.4zM416.39 256a154.34 154.34 0 01-1.53 20.79l45.21 35.46a10.81 10.81 0 012.45 13.75l-42.77 74a10.81 10.81 0 01-13.14 4.59l-44.9-18.08a16.11 16.11 0 00-15.17 1.75A164.48 164.48 0 01325 400.8a15.94 15.94 0 00-8.82 12.14l-6.73 47.89a11.08 11.08 0 01-10.68 9.17h-85.54a11.11 11.11 0 01-10.69-8.87l-6.72-47.82a16.07 16.07 0 00-9-12.22 155.3 155.3 0 01-21.46-12.57 16 16 0 00-15.11-1.71l-44.89 18.07a10.81 10.81 0 01-13.14-4.58l-42.77-74a10.8 10.8 0 012.45-13.75l38.21-30a16.05 16.05 0 006-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 00-6.07-13.94l-38.19-30A10.81 10.81 0 0149.48 186l42.77-74a10.81 10.81 0 0113.14-4.59l44.9 18.08a16.1 16.1 0 0015.17-1.75A164.48 164.48 0 01187 111.2a15.94 15.94 0 008.82-12.14l6.73-47.89A11.08 11.08 0 01213.23 42h85.54a11.11 11.11 0 0110.69 8.87l6.72 47.82a16.07 16.07 0 009 12.22 155.3 155.3 0 0121.46 12.57 16 16 0 0015.11 1.71l44.89-18.07a10.81 10.81 0 0113.14 4.58l42.77 74a10.8 10.8 0 01-2.45 13.75l-38.21 30a16.05 16.05 0 00-6.05 14.08c.33 4.14.55 8.3.55 12.47z"
        stroke={color}
        strokeWidth={32}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="256" cy="256" r="64" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}


function ProfileStackNav({ session, onTargetsChange }) {
  const { theme } = useTheme();
  return (
    <ProfileStack.Navigator screenOptions={stackOptions(theme)}>
      <ProfileStack.Screen
        name="ProfileMain"
        options={({ navigation }) => ({
          title: 'Profile',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ marginRight: spacing[4] }}
            >
              <GearIcon color={theme.accent} size={24} />
            </TouchableOpacity>
          ),
        })}
      >
        {(props) => <ProfileScreen {...props} session={session} onTargetsChange={onTargetsChange} />}
      </ProfileStack.Screen>
      <ProfileStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={({ navigation }) => ({
          title: 'Settings',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ marginLeft: spacing[2] }}
            >
              <Text style={{ color: theme.accent, fontSize: 28, fontWeight: '400', marginTop: -2 }}>‹</Text>
            </TouchableOpacity>
          ),
        })}
      />
      <ProfileStack.Screen
        name="FoodHistory"
        component={FoodHistoryScreen}
        options={({ navigation }) => ({
          title: 'Food History',
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ marginLeft: spacing[2] }}
            >
              <Text style={{ color: theme.accent, fontSize: 28, fontWeight: '400', marginTop: -2 }}>‹</Text>
            </TouchableOpacity>
          ),
        })}
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
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="Profile">
          {(props) => <ProfileStackNav {...props} session={session} onTargetsChange={onTargetsChange} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
