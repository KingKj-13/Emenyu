// Customer Requests — the guest-initiated subset of the notification center
// (table calls, reservations, AI service warnings). This is a focused view over the
// SAME server notifications (no separate data source). Acting on a request acks the
// underlying notification and jumps to the table.
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Card, H2, Muted, EmptyState, Pill } from '../components/ui';
import { theme, priorityColor } from '../components/theme';
import { useNotifications } from '../hooks/useNotifications';
import { useConnectivity } from '../hooks/useConnectivity';
import type { NotificationRow } from '../types/operations';
import type { RootStackParamList } from '../navigation/types';

type Nav = NavigationProp<RootStackParamList>;

const CUSTOMER_SOURCES = new Set(['waiter_call', 'reservation', 'ai_warning']);

export function RequestsScreen() {
  const nav = useNavigation<Nav>();
  const { online } = useConnectivity();
  const { items, loading, stale, fetchedAt, refresh, ack } = useNotifications();

  const requests = useMemo(
    () => items.filter((n) => CUSTOMER_SOURCES.has(n.source)),
    [items]
  );

  const respond = async (row: NotificationRow) => {
    if (!row.readAt && online) void ack(row.id);
    if (row.tableId) nav.navigate('TableDetail', { tableId: row.tableId });
  };

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <SyncBanner online={online} stale={stale} fetchedAt={fetchedAt} />
      <Card>
        <H2>Open requests ({requests.filter((r) => !r.readAt).length})</H2>
        {requests.length === 0 ? (
          <EmptyState title="No customer requests" subtitle="Table calls and reservations will appear here." />
        ) : (
          requests.map((row) => (
            <Pressable key={row.id} onPress={() => void respond(row)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.body}>
                <Text style={[styles.title, !row.readAt && styles.unread]}>{row.title}</Text>
                {row.body ? <Muted>{row.body}</Muted> : null}
                <Text style={styles.meta}>{row.source}{row.tableId ? ` · ${row.tableId}` : ''}</Text>
              </View>
              {row.readAt ? <Pill label="done" color={theme.colors.textDim} /> : <Pill label="open" color={priorityColor(row.priority)} />}
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  pressed: { opacity: 0.7 },
  body: { flex: 1, gap: 2 },
  title: { color: theme.colors.text, fontSize: theme.font.md },
  unread: { fontWeight: '700' },
  meta: { color: theme.colors.textDim, fontSize: theme.font.sm, marginTop: 2 }
});
