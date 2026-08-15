// Root navigation. Gates on auth status: a single Login screen when signed out, the
// main tab navigator (+ detail/requests stack screens) when signed in. Push taps are
// routed here via a navigation ref so a notification can deep-link to a table.
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { addResponseListener } from '../services/push';
import { theme } from '../components/theme';
import type { RootStackParamList, MainTabParamList } from './types';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ShiftScreen } from '../screens/ShiftScreen';
import { TablesScreen } from '../screens/TablesScreen';
import { TableDetailScreen } from '../screens/TableDetailScreen';
import { AddItemsScreen } from '../screens/AddItemsScreen';
import { SplitBillScreen } from '../screens/SplitBillScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WaiterOrderProvider } from '../waiter/WaiterOrderContext';
import { Toast } from '../components/Toast';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const TAB_ICON: Record<keyof MainTabParamList, string> = {
  Home: '🏠',
  Shift: '🕒',
  Tables: '🍽️',
  Alerts: '🔔',
  Profile: '👤'
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.gold,
        tabBarInactiveTintColor: theme.colors.textDim,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>{TAB_ICON[route.name]}</Text>
        )
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Shift" component={ShiftScreen} options={{ title: 'My Shift' }} />
      <Tabs.Screen name="Tables" component={TablesScreen} options={{ title: 'My Tables' }} />
      <Tabs.Screen name="Alerts" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.gold} size="large" />
    </View>
  );
}

export function RootNavigator() {
  const { status } = useAuth();
  const responseBound = useRef(false);

  // Route notification taps once navigation is mounted.
  useEffect(() => {
    if (responseBound.current) return;
    responseBound.current = true;
    return addResponseListener((data) => {
      const tableId = typeof data.tableId === 'string' ? data.tableId : '';
      if (navigationRef.isReady()) {
        if (tableId) navigationRef.navigate('TableDetail', { tableId });
        else navigationRef.navigate('Main');
      }
    });
  }, []);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {status === 'loading' ? (
        <Loading />
      ) : status === 'authenticated' ? (
        <WaiterOrderProvider>
          <RootStack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.surface },
              headerTintColor: theme.colors.text,
              contentStyle: { backgroundColor: theme.colors.bg }
            }}
          >
            <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <RootStack.Screen name="TableDetail" component={TableDetailScreen} options={{ title: 'Table' }} />
            <RootStack.Screen name="AddItems" component={AddItemsScreen} options={{ title: 'Add Items' }} />
            <RootStack.Screen name="SplitBill" component={SplitBillScreen} options={{ title: 'Split Bill', presentation: 'modal' }} />
            <RootStack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat Center' }} />
            <RootStack.Screen name="Requests" component={RequestsScreen} options={{ title: 'Customer Requests' }} />
          </RootStack.Navigator>
          <Toast />
        </WaiterOrderProvider>
      ) : (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Main" component={LoginScreenHost} />
        </RootStack.Navigator>
      )}
    </NavigationContainer>
  );
}

// Login is hosted at the same "Main" route name when unauthenticated so the stack
// has a stable initial route across auth transitions.
function LoginScreenHost() {
  return <LoginScreen />;
}

const navTheme = {
  dark: true,
  colors: {
    primary: theme.colors.gold,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    notification: theme.colors.red
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const }
  }
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }
});
