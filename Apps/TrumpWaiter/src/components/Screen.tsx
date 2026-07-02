// Safe-area screen container with a consistent dark background and optional
// pull-to-refresh scroll body.
import React from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from './theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
}

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true }: ScreenProps) {
  const body = padded ? <View style={styles.pad}>{children}</View> : children;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.gold} />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  pad: { padding: theme.space.lg, gap: theme.space.md }
});
