// Chat Center — guest-message signals (parity with the web waiter's Chat screen).
// Lists conversations the server flagged with detected events, and lets the waiter
// paste a guest message for analysis (which may create a workflow task, e.g. a
// birthday). All detection is server-side; the app only sends + displays.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card, Muted, EmptyState, Pill } from '../components/ui';
import { Button } from '../components/Button';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { waiterApi } from '../api/waiter';
import { tableNum } from '../lib/format';
import type { ChatConversation } from '../types/waiter';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ route }: Props) {
  const { user } = useAuth();
  const waiterName = user?.label && user.label !== 'Waiter' ? user.label : user?.username || 'waiter';
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [tableId, setTableId] = useState(route.params?.tableId || 'table1');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    waiterApi.getChatCenter().then(setConvos).catch(() => setConvos([]));
  }, []);
  useEffect(() => load(), [load]);

  const analyze = useCallback(async () => {
    if (!message.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await waiterApi.analyzeChat({ tableId, message, waiterName });
      setMessage('');
      load();
      setNote(result.tasks.length ? `${result.tasks.length} event detected` : 'No event detected');
    } catch {
      setNote('Could not analyze chat');
    } finally {
      setBusy(false);
    }
  }, [message, tableId, waiterName, load]);

  return (
    <Screen refreshing={busy} onRefresh={load}>
      <Text style={styles.title}>Guest signals</Text>

      <Card>
        <Text style={styles.panelTitle}>Analyze message</Text>
        <TextInput
          style={styles.tableInput}
          value={tableId}
          onChangeText={setTableId}
          placeholder="table1"
          placeholderTextColor={theme.colors.textDim}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          placeholder="Paste or type guest message"
          placeholderTextColor={theme.colors.textDim}
          multiline
        />
        <Button label={busy ? 'Analyzing…' : 'Analyze'} onPress={analyze} loading={busy} disabled={!message.trim()} />
        {note ? <Muted>{note}</Muted> : null}
      </Card>

      {convos.length === 0 ? (
        <EmptyState title="No flagged conversations" subtitle="Important messages appear here after analysis detects an event." />
      ) : (
        convos.map((c) => (
          <Card key={c.tableId}>
            <View style={styles.convoTop}>
              <Text style={styles.convoTable}>Table {tableNum(c.tableId)}</Text>
              <View style={styles.tags}>
                {c.events.slice(0, 3).map((e) => (
                  <Pill key={`${e.type}-${e.label}`} label={e.label} color={theme.colors.gold} />
                ))}
              </View>
            </View>
            <Muted>{c.lastMessage || 'No message preview'}</Muted>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.xl, fontWeight: '800' },
  panelTitle: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  tableInput: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, color: theme.colors.text, paddingHorizontal: theme.space.md, minHeight: 44, fontSize: theme.font.md },
  messageInput: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, color: theme.colors.text, padding: theme.space.md, minHeight: 90, fontSize: theme.font.md, textAlignVertical: 'top' },
  convoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
  convoTable: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1, justifyContent: 'flex-end' }
});
