import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { tokens } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const tabIcon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

/** Bottom navigation: Discover · Events · Playlists · Profile (EXPERIENCE.md IA). */
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="discover"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.colors.accent,
        tabBarInactiveTintColor: tokens.colors.inkSecondary,
        tabBarStyle: { backgroundColor: tokens.colors.surfaceRaised, borderTopColor: tokens.colors.borderHairline },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('compass-outline') }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: tabIcon('party-popper') }} />
      <Tabs.Screen name="playlists" options={{ title: 'Playlists', tabBarIcon: tabIcon('playlist-music') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('account-circle-outline') }} />
    </Tabs>
  );
}
