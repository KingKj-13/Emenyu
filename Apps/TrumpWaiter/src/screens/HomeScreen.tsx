// Home — at-a-glance status for the signed-in waiter: on-duty state, my open tables,
// unread alerts, and quick links into the workflow. All data is live from the server
// (cache-resilient when offline).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { SyncBanner } from '../components/SyncBanner';
import { Button } from '../components/Button';
import { Card, H1, H2, Muted, Pill } from '../components/ui';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { useShift } from '../hooks/useShift';
import { useOwnership } from '../hooks/useOwnership';
import { useNotifications } from '../hooks/useNotifications';
import { useConnectivity } from '../hooks/useConnectivity';
import type { RootStackParamList, MainTabParamList } from '../navigation/types';

type Nav = NavigationProp<RootStackParamList & MainTabParamList>;

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const { online, socketConnected } = useConnectivity();
  const shift = useShift();
  const ownership = useOwnership(user?.username ?? '');
  const notifications = useNotifications();

  const onDuty = Boolean(shift.status?.active);

  const refreshAll = () => {
    void shift.refresh();
    void ownership.refresh();
    void notifications.refresh();
  };

  return (
    <Screen refreshing={shift.loading} onRefresh={refreshAll}>
      <SyncBanner online={online} stale={shift.stale || ownership.stale} fetchedAt={shift.fetchedAt} />
      <View style={styles.header}>
        <H1>Hi {user?.label || user?.username}</H1>
        <Pill label={onDuty ? 'On duty' : 'Off duty'} color={onDuty ? theme.colors.green : theme.colors.textDim} />
      </View>
      <Muted>{socketConnected ? 'Live · realtime connected' : online ? 'Polling for updates' : 'Offline'}</Muted>

      <Card>
        <H2>My tables</H2>
        <Text style={styles.metric}>{ownership.mine.length}</Text>
        <Button label="View my tables" variant="secondary" onPress={() => nav.navigate('Tables')} />
      </Card>

      <Card>
        <H2>Alerts</H2>
        <Text style={styles.metric}>{notifications.unread} unread</Text>
        <Button label="Open notifications" variant="secondary" onPress={() => nav.navigate('Alerts')} />
      </Card>

      <Card>
        <H2>Shift</H2>
        <Muted>{onDuty ? 'You are clocked in.' : 'You are not on a shift.'}</Muted>
        {onDuty ? (
          <Button label="End shift" variant="danger" disabled={!online} loading={shift.busy} onPress={() => shift.endShift('ended from app')} hint={!online ? 'Reconnect to act' : undefined} />
        ) : (
          <Button label="Start shift" disabled={!online} loading={shift.busy} onPress={() => shift.startShift()} hint={!online ? 'Reconnect to act' : undefined} />
        )}
      </Card>

      <Button label="Customer requests" variant="ghost" onPress={() => nav.navigate('Requests')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metric: { color: theme.colors.gold, fontSize: theme.font.xxl, fontWeight: '800' }
});
