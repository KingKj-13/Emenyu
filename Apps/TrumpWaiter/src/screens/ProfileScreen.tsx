// Profile — account info, this build, active device sessions (GET /auth/devices)
// with revoke, and sign out. Session management is the staff's own view of their
// registered devices (multi-device support from Phase 04).
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Button } from '../components/Button';
import { Card, H2, Muted, Pill, EmptyState } from '../components/ui';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { authApi } from '../api/auth';
import { APP_VERSION } from '../config';
import type { DeviceRow } from '../types/api';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

export function ProfileScreen() {
  const { user, deviceId, logout } = useAuth();
  const { online, socketConnected } = useConnectivity();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await authApi.listDevices());
    } catch {
      /* offline / transient — keep prior list */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await authApi.revokeDevice(id);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <SyncBanner online={online} />
      <Card>
        <H2>{user?.label || user?.username}</H2>
        <View style={styles.row}>
          <Muted>Role</Muted>
          <Pill label={user?.role ?? 'waiter'} color={theme.colors.gold} />
        </View>
        <View style={styles.row}>
          <Muted>Realtime</Muted>
          <Pill label={socketConnected ? 'connected' : 'polling'} color={socketConnected ? theme.colors.green : theme.colors.textDim} />
        </View>
        <View style={styles.row}>
          <Muted>App version</Muted>
          <Text style={styles.value}>{APP_VERSION}</Text>
        </View>
      </Card>

      <Card>
        <H2>My devices</H2>
        {devices.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          devices.map((d) => {
            const isThis = d.deviceId === deviceId;
            return (
              <View key={d.deviceId} style={styles.device}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.value}>
                    {d.deviceName || 'Device'} {isThis ? '(this device)' : ''}
                  </Text>
                  <Muted>{d.platform || 'unknown'} · last seen {fmt(d.lastSeenAt)}</Muted>
                </View>
                {!isThis ? (
                  <Button label="Revoke" variant="secondary" disabled={!online || busy} onPress={() => void revoke(d.deviceId)} />
                ) : null}
              </View>
            );
          })
        )}
      </Card>

      <Button label="Sign out" variant="danger" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '600' },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  deviceInfo: { flex: 1, gap: 2 }
});
