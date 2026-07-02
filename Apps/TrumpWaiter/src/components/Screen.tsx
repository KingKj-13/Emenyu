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
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          // Padding + gap live on the content container so a full-height child
          // (e.g. a centred login card) still gets the flexGrow it needs.
          contentContainerStyle={[styles.scroll, padded && styles.pad]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.gold} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        // The body MUST stay flex:1 even when padded — otherwise a child that
        // relies on `flex:1` + `justifyContent:'center'` (LoginScreen) collapses
        // to the top of the screen behind the status bar.
        <View style={[styles.flex, padded && styles.pad]}>{children}</View>
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
