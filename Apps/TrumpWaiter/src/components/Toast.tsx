// Floating toast — reads the shared waiter-order toast and shows a brief banner near
// the bottom of the screen. Rendered once, above the navigator.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';
import { useWaiterOrder } from '../waiter/WaiterOrderContext';

export function Toast() {
  const { toast } = useWaiterOrder();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 78 }]}>
      <View style={styles.toast}>
        <Text style={styles.text}>{toast}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  toast: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    maxWidth: '90%'
  },
  text: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '600', textAlign: 'center' }
});
