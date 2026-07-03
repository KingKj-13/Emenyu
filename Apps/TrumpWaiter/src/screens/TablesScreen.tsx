// Tables — the live floor (parity with the web waiter's Tables screen). Every table
// shows status / guests / spend, sorted by urgency, with a "Next best action"
// banner. Tap a table to open its detail (order taking + AI upsell). The floor is
// server-authoritative (/api/floor) and refreshes on socket events.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Muted, EmptyState } from '../components/ui';
import { theme } from '../components/theme';
import { useConnectivity } from '../hooks/useConnectivity';
import { useFloor } from '../hooks/useFloor';
import { useWaiterOrder } from '../waiter/WaiterOrderContext';
import { statusForTable, statusLabel, statusColor, statusRank, nextAction, type TableStatus } from '../waiter/tableStatus';
import { money, seatedLabel } from '../lib/format';
import type { FloorTable } from '../types/waiter';
import type { RootStackParamList } from '../navigation/types';

type Nav = NavigationProp<RootStackParamList>;

function TableCard({ table, status, onOpen }: { table: FloorTable; status: TableStatus; onOpen: () => void }) {
  const color = statusColor(status);
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.card, { borderLeftColor: color }, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <Text style={styles.tableNo}>Table {table.number}</Text>
        <View style={[styles.pill, { borderColor: color }]}>
          <Text style={[styles.pillText, { color }]}>{statusLabel(status)}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{table.guests || 0} guests</Text>
        <Text style={styles.meta}>{seatedLabel(table.seatedMinutes)}</Text>
        <Text style={styles.spend}>{table.spend ? money(table.spend) : 'R0'}</Text>
      </View>
      <Text style={[styles.nextAction, { color }]}>{nextAction(status)}</Text>
    </Pressable>
  );
}

export function TablesScreen() {
  const nav = useNavigation<Nav>();
  const { online } = useConnectivity();
  const { floor, tasks, loading, stale, fetchedAt, reload } = useFloor();
  const { selectTable } = useWaiterOrder();
  const [query, setQuery] = useState('');

  const tables = floor?.tables ?? [];
  const ranked = useMemo(() => {
    const withStatus = tables.map((t) => ({ table: t, status: statusForTable(t, tasks) }));
    withStatus.sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || (b.table.seatedMinutes || 0) - (a.table.seatedMinutes || 0)
    );
    return withStatus;
  }, [tables, tasks]);

  const filtered = query ? ranked.filter((r) => String(r.table.number).includes(query.trim())) : ranked;
  const next = ranked.find((r) => r.status !== 'empty');

  const open = (tableId: string) => {
    selectTable(tableId);
    nav.navigate('TableDetail', { tableId });
  };

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <SyncBanner online={online} stale={stale} fetchedAt={fetchedAt} />

      <View style={styles.hero}>
        <Text style={styles.kicker}>Next best action</Text>
        {next ? (
          <>
            <Text style={styles.heroTitle}>Table {next.table.number}</Text>
            <Text style={styles.heroSub}>
              {statusLabel(next.status)} · {next.table.guests || 0} guests · {money(next.table.spend || 0)}
            </Text>
            <Pressable onPress={() => open(next.table.tableId)} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Text style={styles.ctaText}>Open table</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.heroTitle}>Floor clear</Text>
            <Text style={styles.heroSub}>No active tables right now.</Text>
          </>
        )}
      </View>

      <View style={styles.metrics}>
        <Metric value={String(ranked.filter((r) => r.status !== 'empty').length)} label="Active" />
        <Metric value={String(tasks.filter((t) => t.status === 'open').length)} label="Alerts" />
        <Metric value={money(tables.reduce((s, t) => s + (t.spend || 0), 0))} label="Spend" />
      </View>

      <View style={styles.search}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Jump to table number"
          placeholderTextColor={theme.colors.textDim}
          keyboardType="number-pad"
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState title={tables.length ? 'No tables match' : 'No tables loaded'} subtitle={tables.length ? undefined : 'Pull to refresh'} />
      ) : (
        filtered.map(({ table, status }) => (
          <TableCard key={table.tableId} table={table} status={status} onOpen={() => open(table.tableId)} />
        ))
      )}
    </Screen>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    gap: 6
  },
  kicker: { color: theme.colors.gold, fontSize: theme.font.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: theme.colors.text, fontSize: theme.font.xxl, fontWeight: '800' },
  heroSub: { color: theme.colors.textDim, fontSize: theme.font.md },
  cta: { marginTop: theme.space.md, backgroundColor: theme.colors.gold, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#1a1408', fontSize: theme.font.md, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: theme.space.md },
  metric: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    alignItems: 'center',
    gap: 2
  },
  metricValue: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md
  },
  searchIcon: { color: theme.colors.textDim, fontSize: 20 },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: theme.font.md, minHeight: 46 },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    gap: theme.space.sm
  },
  pressed: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tableNo: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '800' },
  pill: { borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md, paddingVertical: 3 },
  pillText: { fontSize: theme.font.sm, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.lg },
  meta: { color: theme.colors.textDim, fontSize: theme.font.sm },
  spend: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700', marginLeft: 'auto' },
  nextAction: { fontSize: theme.font.sm, fontWeight: '600' }
});
