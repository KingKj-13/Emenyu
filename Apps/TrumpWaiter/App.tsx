// App root — providers + navigation. Notification handler is configured once at
// startup so foreground pushes render. The AuthProvider gates the whole tree.
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { configureNotificationHandler } from './src/services/push';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { UpdateBanner } from './src/components/UpdateBanner';

export default function App() {
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
          {/* Overlays the whole app; self-hides unless a newer APK is published. */}
          <UpdateBanner />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
