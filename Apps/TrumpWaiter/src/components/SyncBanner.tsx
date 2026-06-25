// Connection + freshness banner. Shown when offline OR when displaying cached
// (stale) data so staff always know whether what they see is live. Satisfies the
// OFFLINE-IMPLEMENTATION requirement to "display sync status clearly."
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

interface SyncBannerProps {
  online: boolean;
  stale?: boolean;
  fetchedAt?: number | null;
}

function fmt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SyncBanner({ online, stale, fetchedAt }: SyncBannerProps) {
  if (online && !stale) return null;
  const offline = !online;
  const label = offline
    ? `Offline${fetchedAt ? ` · last synced ${fmt(fetchedAt)}` : ''}`
    : `Showing cached data${fetchedAt ? ` · ${fmt(fetchedAt)}` : ''}`;
  return (
    <View style={[styles.bar, offline ? styles.offline : styles.stale]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: theme.space.sm, paddingHorizontal: theme.space.lg, alignItems: 'center' },
  offline: { backgroundColor: theme.colors.red },
  stale: { backgroundColor: theme.colors.goldDim },
  text: { color: '#0b0b0c', fontWeight: '700', fontSize: theme.font.sm }
});
