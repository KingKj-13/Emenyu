// My Shift — start/end the shift and view live shift metrics. Start/End are
// server-authoritative (online-only); metrics come straight from the shift record.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Button } from '../components/Button';
import { Card, H2, Muted } from '../components/ui';
import { theme } from '../components/theme';
import { useShift } from '../hooks/useShift';
import { useConnectivity } from '../hooks/useConnectivity';

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}

export function ShiftScreen() {
  const { online } = useConnectivity();
  const { status, loading, stale, fetchedAt, busy, error, refresh, startShift, endShift } = useShift();
  const active = Boolean(status?.active);
  const shift = status?.shift;

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <SyncBanner online={online} stale={stale} fetchedAt={fetchedAt} />
      <Card>
        <H2>{active ? 'On duty' : 'Off duty'}</H2>
        {active ? (
          <Muted>Started {fmtTime(shift?.startedAt)}</Muted>
        ) : (
          <Muted>Start your shift to begin taking tables.</Muted>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {active ? (
          <Button label="End shift" variant="danger" disabled={!online} loading={busy} onPress={() => endShift('ended from app')} hint={!online ? 'Reconnect to end your shift' : undefined} />
        ) : (
          <Button label="Start shift" disabled={!online} loading={busy} onPress={() => startShift()} hint={!online ? 'Reconnect to start your shift' : undefined} />
        )}
      </Card>

      {active ? (
        <Card>
          <H2>This shift</H2>
          <View style={styles.metrics}>
            <Metric label="Orders" value={status?.ordersHandled ?? shift?.ordersHandled ?? 0} />
            <Metric label="Revenue" value={`R${Math.round(status?.revenueHandled ?? shift?.revenueHandled ?? 0)}`} />
            <Metric label="Tasks" value={status?.responseMetrics?.tasksResolved ?? 0} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1, gap: theme.space.xs },
  metricValue: { color: theme.colors.gold, fontSize: theme.font.xl, fontWeight: '800' },
  error: { color: theme.colors.red, fontSize: theme.font.sm }
});
