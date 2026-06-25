// Table Detail — the ownership actions for one table, plus its change history.
// Workflow (Step 5): if I own it I can TRANSFER it to a colleague; if a colleague
// owns it I can TAKE OVER. Both are server-validated + audited; both are disabled
// offline. The app never mutates ownership locally — it calls the server and re-reads.
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Button } from '../components/Button';
import { Card, Field, H2, Muted, Pill, EmptyState } from '../components/ui';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { opsApi } from '../api/ops';
import { readThrough } from '../services/offline';
import type { OwnershipRow } from '../types/operations';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TableDetail'>;

function norm(v?: string): string {
  return String(v || '').trim().toLowerCase();
}

function fmt(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

export function TableDetailScreen({ route, navigation }: Props) {
  const { tableId } = route.params;
  const { user } = useAuth();
  const { online } = useConnectivity();

  const [owner, setOwner] = useState<OwnershipRow | null>(null);
  const [history, setHistory] = useState<OwnershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toWaiter, setToWaiter] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: tableId });
  }, [navigation, tableId]);

  const load = useCallback(async () => {
    const ownerRes = await readThrough<OwnershipRow | null>(`table_owner_${tableId}`, () => opsApi.tableOwner(tableId));
    setOwner(ownerRes.data ?? null);
    setStale(ownerRes.stale);
    setFetchedAt(ownerRes.fetchedAt);
    try {
      const h = await opsApi.ownershipHistory(tableId);
      setHistory(h);
    } catch {
      /* history is best-effort */
    }
    setLoading(false);
  }, [tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  const iOwn = owner ? norm(owner.waiterName) === norm(user?.username) : false;
  const hasOwner = Boolean(owner && (owner.status ?? 'active') === 'active' && owner.waiterName);

  const act = async (fn: () => Promise<unknown>, successReset = true) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (successReset) {
        setToWaiter('');
        setReason('');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <SyncBanner online={online} stale={stale} fetchedAt={fetchedAt} />

      <Card>
        <H2>Table {tableId}</H2>
        {hasOwner ? (
          <View style={styles.ownerRow}>
            <Muted>Owner</Muted>
            <Pill label={iOwn ? 'You' : owner!.waiterName} color={iOwn ? theme.colors.green : theme.colors.blue} />
          </View>
        ) : (
          <Muted>Unassigned</Muted>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {iOwn ? (
        <Card>
          <H2>Transfer table</H2>
          <Muted>Hand this table to another waiter.</Muted>
          <Field label="To waiter (username)" value={toWaiter} onChangeText={setToWaiter} placeholder="e.g. sam" />
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. going on break" autoCapitalize="sentences" />
          <Button
            label="Transfer"
            disabled={!online || !toWaiter.trim()}
            loading={busy}
            onPress={() => act(() => opsApi.transferTable(tableId, toWaiter.trim(), reason.trim()))}
            hint={!online ? 'Reconnect to transfer' : undefined}
          />
        </Card>
      ) : (
        <Card>
          <H2>Take over table</H2>
          <Muted>{hasOwner ? `Currently with ${owner!.waiterName}.` : 'This table is unassigned.'} Take responsibility for it.</Muted>
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. covering section" autoCapitalize="sentences" />
          <Button
            label="Take over"
            disabled={!online}
            loading={busy}
            onPress={() => act(() => opsApi.takeoverTable(tableId, reason.trim()))}
            hint={!online ? 'Reconnect to take over' : undefined}
          />
        </Card>
      )}

      <Card>
        <H2>History</H2>
        {history.length === 0 ? (
          <EmptyState title="No ownership history" />
        ) : (
          history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={styles.historyText}>
                {h.changeType || 'change'} → {h.waiterName}
                {h.previousWaiter ? ` (from ${h.previousWaiter})` : ''}
              </Text>
              <Muted>{fmt(h.assignedAt)}{h.reason ? ` · ${h.reason}` : ''}</Muted>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ownerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyRow: {
    paddingVertical: theme.space.sm,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2
  },
  historyText: { color: theme.colors.text, fontSize: theme.font.md },
  error: { color: theme.colors.red, fontSize: theme.font.sm }
});
