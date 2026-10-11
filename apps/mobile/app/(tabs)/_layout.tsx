import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { View, type ColorValue } from 'react-native';
import { MiniPlayer } from '@/player/MiniPlayer';
import { tokens } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const tabIcon = (name: IconName, focusedName: IconName = name) => {
  const TabIcon = ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <MaterialCommunityIcons name={focused ? focusedName : name} color={color} size={size} />
  );
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
};

/**
 * Bottom navigation: Home · Search · Events · Playlists · Profile (EXPERIENCE.md IA).
 * The mini-player sits right above the tab bar on every tab while a preview is loaded.
 */
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="discover"
      tabBar={(props) => (
        <View>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.colors.accent,
        tabBarInactiveTintColor: tokens.colors.inkSecondary,
        tabBarStyle: {
          backgroundColor: tokens.colors.surfaceBase,
          borderTopColor: tokens.colors.borderHairline,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontWeight: '500' },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Home', tabBarIcon: tabIcon('home-variant-outline', 'home-variant') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('magnify') }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: tabIcon('party-popper') }} />
      <Tabs.Screen name="playlists" options={{ title: 'Playlists', tabBarIcon: tabIcon('playlist-music-outline', 'playlist-music') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('account-circle-outline', 'account-circle') }} />
    </Tabs>
  );
}
