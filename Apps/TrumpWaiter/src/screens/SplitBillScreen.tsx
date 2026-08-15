// Split Bill — split the full table bill (already-sent items + waiter-added lines)
// equally, by item, or with custom amounts (parity with the web SplitBillModal).
// Presented as a modal. Local calculation only — the bill itself is server-owned.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Muted } from '../components/ui';
import { Button } from '../components/Button';
import { theme } from '../components/theme';
import { useWaiterOrder } from '../waiter/WaiterOrderContext';
import { money, tableNum } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SplitBill'>;
type Mode = 'equal' | 'item' | 'custom';

export function SplitBillScreen({ route, navigation }: Props) {
  const { tableId } = route.params;
  const { order, placedItems, showToast } = useWaiterOrder();

  const lines = useMemo(
    () => [
      ...placedItems.map((p) => ({ name: p.name, price: p.price, quantity: p.quantity })),
      ...order.map((o) => ({ name: o.name, price: o.price, quantity: o.quantity }))
    ],
    [placedItems, order]
  );
  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);

  const [mode, setMode] = useState<Mode>('equal');
  const [guests, setGuests] = useState(4);
  const [assign, setAssign] = useState<Record<number, number>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});

  const equalPer = guests > 0 ? Math.ceil(total / guests) : 0;
  const setGuestCount = (n: number) => setGuests(Math.max(1, Math.min(20, n)));

  const itemTotals = useMemo(() => {
    const totals = Array.from({ length: guests }, () => 0);
    lines.forEach((l, i) => {
      const g = Math.min(assign[i] ?? 0, guests - 1);
      totals[g] += l.price * l.quantity;
    });
    return totals;
  }, [lines, assign, guests]);

  const customSum = useMemo(() => Object.values(custom).reduce((s, v) => s + (parseFloat(v) || 0), 0), [custom]);
  const customRemaining = Number((total - customSum).toFixed(2));

  return (
    <Screen>
      <Text style={styles.title}>Split the bill</Text>
      <Muted>Table {tableNum(tableId)} · Total {money(total)}</Muted>

      <View style={styles.modes}>
        {(['equal', 'item', 'custom'] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeBtn, mode === m && styles.modeActive]}>
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
              {m === 'equal' ? 'Equally' : m === 'item' ? 'By item' : 'Custom'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.guestRow}>
        <Pressable onPress={() => setGuestCount(guests - 1)} style={styles.guestBtn}>
          <Text style={styles.guestBtnText}>−</Text>
        </Pressable>
        <View style={styles.guestMid}>
          <Text style={styles.guestCount}>{guests}</Text>
          <Muted>Guests</Muted>
        </View>
        <Pressable onPress={() => setGuestCount(guests + 1)} style={styles.guestBtn}>
          <Text style={styles.guestBtnText}>+</Text>
        </Pressable>
      </View>

      {mode === 'equal' && (
        <View style={styles.card}>
          <Muted>{money(total)} ÷ {guests} guests</Muted>
          <Text style={styles.big}>{money(equalPer)}</Text>
          <Muted>Each</Muted>
        </View>
      )}

      {mode === 'item' &&
        (lines.length === 0 ? (
          <Muted>No items on this table yet.</Muted>
        ) : (
          <View>
            {lines.map((l, i) => (
              <View key={`${l.name}-${i}`} style={styles.assignRow}>
                <Text style={styles.assignName}>{l.quantity}× {l.name}</Text>
                <View style={styles.guestPicker}>
                  {Array.from({ length: guests }, (_, g) => (
                    <Pressable
                      key={g}
                      onPress={() => setAssign((prev) => ({ ...prev, [i]: g }))}
                      style={[styles.guestPick, (assign[i] ?? 0) === g && styles.guestPickActive]}
                    >
                      <Text style={[styles.guestPickText, (assign[i] ?? 0) === g && styles.guestPickTextActive]}>{g + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <View style={styles.totalsBox}>
              {itemTotals.map((amt, i) => (
                <View key={i} style={styles.totalRow}>
                  <Text style={styles.totalName}>Guest {i + 1}</Text>
                  <Text style={styles.totalValue}>{money(amt)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

      {mode === 'custom' && (
        <View>
          {Array.from({ length: guests }, (_, i) => (
            <View key={i} style={styles.totalRow}>
              <Text style={styles.totalName}>Guest {i + 1}</Text>
              <TextInput
                style={styles.customInput}
                keyboardType="decimal-pad"
                value={custom[i] ?? ''}
                placeholder="0"
                placeholderTextColor={theme.colors.textDim}
                onChangeText={(v) => setCustom((prev) => ({ ...prev, [i]: v.replace(/[^0-9.]/g, '') }))}
              />
            </View>
          ))}
          <View style={[styles.totalRow, styles.balanceRow]}>
            <Text style={styles.totalName}>{customRemaining === 0 ? 'Balanced' : customRemaining > 0 ? 'Remaining' : 'Over by'}</Text>
            <Text style={[styles.totalValue, { color: customRemaining === 0 ? theme.colors.gold : customRemaining < 0 ? theme.colors.red : theme.colors.text }]}>
              {money(Math.abs(customRemaining))}
            </Text>
          </View>
        </View>
      )}

      <Button label="Print split receipts" onPress={() => { showToast('Split receipts sent to printer'); navigation.goBack(); }} />
      <Button label="Close" variant="secondary" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.xl, fontWeight: '800' },
  modes: { flexDirection: 'row', gap: theme.space.sm },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.colors.surface },
  modeActive: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold },
  modeText: { color: theme.colors.textDim, fontWeight: '700', fontSize: theme.font.sm },
  modeTextActive: { color: '#1a1408' },
  guestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.space.xl, marginVertical: theme.space.md },
  guestBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.gold, alignItems: 'center', justifyContent: 'center' },
  guestBtnText: { color: theme.colors.gold, fontSize: 24, fontWeight: '700', lineHeight: 26 },
  guestMid: { alignItems: 'center' },
  guestCount: { color: theme.colors.text, fontSize: 44, fontWeight: '800' },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: theme.space.lg, alignItems: 'center', gap: 4 },
  big: { color: theme.colors.gold, fontSize: 44, fontWeight: '800' },
  assignRow: { paddingVertical: theme.space.sm, borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: theme.space.sm },
  assignName: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '600' },
  guestPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  guestPick: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  guestPickActive: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold },
  guestPickText: { color: theme.colors.textDim, fontWeight: '700' },
  guestPickTextActive: { color: '#1a1408' },
  totalsBox: { marginTop: theme.space.md, gap: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  totalName: { color: theme.colors.text, fontSize: theme.font.md },
  totalValue: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  customInput: { width: 120, textAlign: 'right', backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.sm, color: theme.colors.text, paddingHorizontal: theme.space.md, minHeight: 42, fontSize: theme.font.md },
  balanceRow: { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: theme.space.sm, paddingTop: theme.space.sm }
});
