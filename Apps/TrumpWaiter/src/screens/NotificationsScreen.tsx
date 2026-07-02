// Notifications — the staff notification center (waiter_call, reassignment,
// table_transfer, ai_warning, system…). Live via socket, polled as a fallback,
// reconciled against the server. Acknowledge marks readAt (audited server-side).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Button } from '../components/Button';
import { Card, H2, Muted, EmptyState } from '../components/ui';
import { theme, priorityColor } from '../components/theme';
import { useNotifications } from '../hooks/useNotifications';
import { useConnectivity } from '../hooks/useConnectivity';
import type { NotificationRow } from '../types/operations';
import type { RootStackParamList } from '../navigation/types';

type Nav = NavigationProp<RootStackParamList>;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function NotificationItem({ row, onPress }: { row: NotificationRow; onPress: () => void }) {
  const unread = !row.readAt;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={[styles.dot, { backgroundColor: unread ? priorityColor(row.priority) : 'transparent', borderColor: priorityColor(row.priority) }]} />
      <View style={styles.itemBody}>
        <Text style={[styles.title, unread && styles.unreadTitle]}>{row.title}</Text>
        {row.body ? <Muted>{row.body}</Muted> : null}
        <Text style={styles.meta}>
          {row.source}
          {row.tableId ? ` · ${row.tableId}` : ''} · {timeAgo(row.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

export function NotificationsScreen() {
  const nav = useNavigation<Nav>();
  const { online } = useConnectivity();
  const { items, unread, loading, stale, fetchedAt, refresh, ack, ackAll } = useNotifications();

  const openItem = async (row: NotificationRow) => {
    if (!row.readAt && online) void ack(row.id);
    if (row.tableId) nav.navigate('TableDetail', { tableId: row.tableId });
  };

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <SyncBanner online={online} stale={stale} fetchedAt={fetchedAt} />
      <View style={styles.header}>
        <H2>{unread} unread</H2>
        <Button label="Mark all read" variant="ghost" disabled={!online || unread === 0} onPress={() => void ackAll()} />
      </View>

      <Card>
        {items.length === 0 ? (
          <EmptyState title="No notifications" subtitle="You're all caught up." />
        ) : (
          items.map((row) => <NotificationItem key={row.id} row={row} onPress={() => void openItem(row)} />)
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: {
    flexDirection: 'row',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  pressed: { opacity: 0.7 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, marginTop: 6 },
  itemBody: { flex: 1, gap: 2 },
  title: { color: theme.colors.text, fontSize: theme.font.md },
  unreadTitle: { fontWeight: '700' },
  meta: { color: theme.colors.textDim, fontSize: theme.font.sm, marginTop: 2 }
});
