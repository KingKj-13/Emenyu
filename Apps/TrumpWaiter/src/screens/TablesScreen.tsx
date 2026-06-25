// My Tables — the floor as owned by waiters. "My tables" (owned by me) and "Other
// tables" (owned by colleagues, available to take over). Tap a table for detail and
// transfer/take-over actions. Ownership is server-authoritative; this is a view.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Card, H2, Muted, EmptyState, Pill } from '../components/ui';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { useOwnership } from '../hooks/useOwnership';
import { useConnectivity } from '../hooks/useConnectivity';
import type { OwnershipRow } from '../types/operations';
import type { RootStackParamList } from '../navigation/types';

type Nav = NavigationProp<RootStackParamList>;

function TableRow({ row, onPress, mine }: { row: OwnershipRow; onPress: () => void; mine: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowMain}>
        <Text style={styles.tableId}>{row.tableId}</Text>
        <Muted>{mine ? 'You' : row.waiterName}</Muted>
      </View>
      <Pill label={row.changeType || row.status || 'active'} color={mine ? theme.colors.green : theme.colors.textDim} />
    </Pressable>
  );
}

export function TablesScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { online } = useConnectivity();
  const { mine, others, loading, stale, fetchedAt, refresh } = useOwnership(user?.username ?? '');

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <SyncBanner online={online} stale={stale} fetchedAt={fetchedAt} />

      <Card>
        <H2>My tables ({mine.length})</H2>
        {mine.length === 0 ? (
          <Muted>You have no tables assigned. Take over a table below or wait to be assigned.</Muted>
        ) : (
          mine.map((row) => (
            <TableRow key={row.id} row={row} mine onPress={() => nav.navigate('TableDetail', { tableId: row.tableId })} />
          ))
        )}
      </Card>

      <Card>
        <H2>Other tables ({others.length})</H2>
        {others.length === 0 ? (
          <EmptyState title="No other active tables" />
        ) : (
          others.map((row) => (
            <TableRow key={row.id} row={row} mine={false} onPress={() => nav.navigate('TableDetail', { tableId: row.tableId })} />
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
    paddingVertical: theme.space.md,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  pressed: { opacity: 0.7 },
  rowMain: { gap: 2 },
  tableId: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '700' }
});
