// Table Detail — order taking + AI upsell for one table (parity with the web
// waiter's TableDetails). Shows the guest's LIVE cart (synced) alongside items
// already sent to the kitchen, quantity steppers + remove on editable lines, the
// AI Recommendation + Revenue Opportunity panel (with Add-to-cart + upsell logging),
// Send-to-Kitchen, and quick actions (Add Item, Split Bill, Call Manager, View
// Chat). Table ownership (transfer / take over) is kept as a secondary section.
// Everything round-trips through the server — no local business logic.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Card, Field, Muted, Pill, EmptyState } from '../components/ui';
import { theme } from '../components/theme';
import { useAuth } from '../auth/AuthContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useFloor } from '../hooks/useFloor';
import { useWaiterOrder } from '../waiter/WaiterOrderContext';
import { waiterApi } from '../api/waiter';
import { opsApi } from '../api/ops';
import { money, moneyExact, seatedLabel } from '../lib/format';
import { statusForTable, statusLabel, statusColor } from '../waiter/tableStatus';
import type { CartRec, CartRecResponse, TableIntel, OrderLine } from '../types/waiter';
import type { OwnershipRow } from '../types/operations';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TableDetail'>;

function norm(v?: string): string {
  return String(v || '').trim().toLowerCase();
}

export function TableDetailScreen({ route, navigation }: Props) {
  const { tableId } = route.params;
  const { user } = useAuth();
  const { online } = useConnectivity();
  const { floor, tasks } = useFloor();
  const {
    selectedTableId,
    selectTable,
    order,
    placedItems,
    orderTotal,
    addToOrder,
    changeQty,
    removeLine,
    sending,
    sendToKitchen,
    respondToTable,
    events,
    showToast
  } = useWaiterOrder();

  const [intel, setIntel] = useState<TableIntel | null>(null);
  const [rec, setRec] = useState<CartRecResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState<OwnershipRow | null>(null);
  const [toWaiter, setToWaiter] = useState('');

  const waiterName = user?.label && user.label !== 'Waiter' ? user.label : user?.username || 'waiter';
  const event = events[tableId];
  const table = floor?.tables.find((t) => t.tableId === tableId) || null;
  const status = table ? statusForTable(table, tasks) : 'active';
  const tableNumber = table?.number ?? (Number(String(tableId).replace(/^table/i, '')) || tableId);
  const currentSpend = (table?.spend || 0) + orderTotal;

  // Ensure this table is the active order context (covers deep-link / cold open).
  useEffect(() => {
    if (selectedTableId !== tableId) selectTable(tableId);
    navigation.setOptions({ title: `Table ${tableNumber}` });
  }, [tableId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guest intel (VIP, allergies, favourites, opportunity).
  useEffect(() => {
    let alive = true;
    waiterApi.getTableIntel(tableId).then((i) => alive && setIntel(i)).catch(() => alive && setIntel(null));
    opsApi.tableOwner(tableId).then((o) => alive && setOwner(o)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tableId]);

  // Live AI recommendations — recompute whenever the cart or event changes.
  const cartSig = useMemo(() => order.map((l) => `${l.name}:${l.quantity}`).join('|'), [order]);
  useEffect(() => {
    let alive = true;
    waiterApi
      .cartRecommendations({ cart: order.map((l) => ({ name: l.name, price: l.price, qty: l.quantity })), event: event?.type || null })
      .then((r) => alive && setRec(r))
      .catch(() => alive && setRec(null));
    return () => {
      alive = false;
    };
  }, [cartSig, event?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const recs = rec?.recommendations ?? [];
  const topRec = recs[0];
  const uplift = recs.reduce((s, r) => s + (r.upsell || r.price || 0), 0);

  const addRec = useCallback(
    (r: CartRec) => {
      addToOrder(r);
      showToast(`Added ${r.name}`);
      waiterApi
        .recordUpsell({ waiterName, tableId, suggestedItem: r.name, accepted: true, source: r.source_title || 'cart-rec', value: r.price })
        .catch(() => undefined);
    },
    [addToOrder, showToast, waiterName, tableId]
  );

  const callManager = useCallback(async () => {
    setBusy(true);
    try {
      await waiterApi.createTask({ tableId, type: 'manager_request', title: 'Manager Request', message: 'Please visit this table.', priority: 1, waiterName });
      showToast('Manager request sent');
    } catch {
      showToast('Could not send manager request');
    } finally {
      setBusy(false);
    }
  }, [tableId, waiterName, showToast]);

  const requestBirthday = useCallback(async () => {
    setBusy(true);
    try {
      await waiterApi.requestBirthdayApproval({ tableId, waiterName, itemName: 'Complimentary dessert', reason: event?.label || 'Birthday opportunity' });
      showToast('Birthday approval sent to manager');
    } catch {
      showToast('Could not send approval request');
    } finally {
      setBusy(false);
    }
  }, [tableId, waiterName, event?.label, showToast]);

  const iOwn = owner ? norm(owner.waiterName) === norm(user?.username) : false;
  const transfer = useCallback(async () => {
    if (!toWaiter.trim()) return;
    setBusy(true);
    try {
      await opsApi.transferTable(tableId, toWaiter.trim());
      setToWaiter('');
      const o = await opsApi.tableOwner(tableId).catch(() => null);
      setOwner(o);
      showToast(`Table handed to ${toWaiter.trim()}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }, [tableId, toWaiter, showToast]);

  const takeover = useCallback(async () => {
    setBusy(true);
    try {
      await opsApi.takeoverTable(tableId);
      const o = await opsApi.tableOwner(tableId).catch(() => null);
      setOwner(o);
      showToast('You now own this table');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Take over failed');
    } finally {
      setBusy(false);
    }
  }, [tableId, showToast]);

  const insightTags = buildInsightTags(intel, event?.label);

  return (
    <Screen>
      {/* Header */}
      <View style={styles.headRow}>
        <View>
          <Text style={styles.kicker}>Table details</Text>
          <Text style={styles.title}>Table {tableNumber}</Text>
        </View>
        <Pill label={statusLabel(status)} color={statusColor(status)} />
      </View>

      {status === 'calling' && (
        <Button label="On my way — respond to guest" onPress={() => { respondToTable(tableId); showToast('Guest notified you are on the way'); }} />
      )}

      {/* Facts */}
      <View style={styles.facts}>
        <Fact label="Guests" value={String(table?.guests || 0)} />
        <Fact label="Seated" value={seatedLabel(table?.seatedMinutes)} />
        <Fact label="Spend" value={money(currentSpend)} />
      </View>

      {/* Current cart */}
      <Card>
        <Text style={styles.panelTitle}>Current cart</Text>
        {placedItems.length === 0 && order.length === 0 ? (
          <Muted>No items yet. Add from the menu below.</Muted>
        ) : (
          <>
            {placedItems.map((l, i) => (
              <View key={`sent-${l.name}-${i}`} style={styles.line}>
                <View style={styles.lineMain}>
                  <Text style={styles.lineName}>{l.quantity}× {l.name}</Text>
                  <Muted>Sent to kitchen</Muted>
                </View>
                <Text style={styles.linePrice}>{money(l.price * l.quantity)}</Text>
              </View>
            ))}
            {order.map((l, i) => (
              <CartRow key={`edit-${l.name}-${i}`} line={l} onDec={() => changeQty(i, -1)} onInc={() => changeQty(i, 1)} onRemove={() => removeLine(i)} />
            ))}
          </>
        )}
      </Card>

      {/* AI recommendation */}
      <Card style={styles.aiCard}>
        <Text style={styles.aiHead}>✦ AI Recommendation</Text>
        {topRec ? (
          <>
            <Text style={styles.aiName}>{topRec.name}</Text>
            <Text style={styles.aiReason}>{topRec.reason || 'Best available pairing for this cart.'}</Text>
            {!!(topRec.script || topRec.story) && <Text style={styles.aiScript}>“{topRec.script || topRec.story}”</Text>}
            <View style={styles.aiFoot}>
              <Text style={styles.aiPrice}>+{money(topRec.upsell || topRec.price || 0)}</Text>
              <Pressable onPress={() => addRec(topRec)} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
                <Text style={styles.addBtnText}>+ Add to cart</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Muted>Add an item to the cart for live AI recommendations.</Muted>
        )}
      </Card>

      {/* Revenue opportunity */}
      <Card>
        <Text style={styles.panelTitle}>Revenue Opportunity</Text>
        <View style={styles.revRow}>
          <Muted>Current spend</Muted>
          <Text style={styles.revValue}>{moneyExact(currentSpend)}</Text>
        </View>
        {recs.slice(0, 3).map((r) => (
          <View key={r.name} style={styles.revRow}>
            <Text style={styles.revName}>{r.name}</Text>
            <Text style={styles.revValue}>+{money(r.upsell || r.price)}</Text>
          </View>
        ))}
        <View style={[styles.revRow, styles.revTotal]}>
          <Text style={styles.revTotalLabel}>Potential additional revenue</Text>
          <Text style={styles.revTotalValue}>{moneyExact(uplift)}</Text>
        </View>
      </Card>

      {/* Guest insights */}
      <Card>
        <Text style={styles.panelTitle}>Guest insights</Text>
        {insightTags.length ? (
          <View style={styles.chips}>
            {insightTags.map((t) => (
              <Pill key={t} label={t} color={theme.colors.gold} />
            ))}
          </View>
        ) : (
          <Muted>No guest insights yet</Muted>
        )}
        {event?.type === 'birthday' && <Button label="Request complimentary dessert" onPress={requestBirthday} loading={busy} />}
      </Card>

      {/* Quick actions */}
      <View style={styles.actions}>
        <ActionBtn label="＋ Add item" onPress={() => navigation.navigate('AddItems', { tableId })} />
        <ActionBtn label="⇋ Split bill" onPress={() => navigation.navigate('SplitBill', { tableId })} />
        <ActionBtn label="⚑ Call manager" onPress={callManager} />
        <ActionBtn label="💬 View chat" onPress={() => navigation.navigate('Chat', { tableId })} />
      </View>

      {/* Send to kitchen */}
      <Button
        label={sending ? 'Sending…' : `Send to kitchen${order.length ? ` · ${order.length} item${order.length > 1 ? 's' : ''}` : ''}`}
        disabled={order.length === 0 || sending || !online}
        loading={sending}
        onPress={sendToKitchen}
        hint={!online ? 'Reconnect to send' : order.length === 0 ? 'Add items first' : undefined}
      />

      {/* Ownership (secondary) */}
      <Card>
        <Text style={styles.panelTitle}>Table ownership</Text>
        <View style={styles.ownerRow}>
          <Muted>Owner</Muted>
          <Pill label={owner?.waiterName ? (iOwn ? 'You' : owner.waiterName) : 'Unassigned'} color={iOwn ? theme.colors.green : theme.colors.blue} />
        </View>
        {iOwn ? (
          <>
            <Field label="Transfer to (username)" value={toWaiter} onChangeText={setToWaiter} placeholder="e.g. sam" />
            <Button label="Transfer table" onPress={transfer} disabled={!online || !toWaiter.trim()} loading={busy} />
          </>
        ) : (
          <Button label="Take over table" onPress={takeover} disabled={!online} loading={busy} />
        )}
      </Card>
    </Screen>
  );
}

function CartRow({ line, onDec, onInc, onRemove }: { line: OrderLine; onDec: () => void; onInc: () => void; onRemove: () => void }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineMain}>
        <Text style={styles.lineName}>{line.quantity}× {line.name}</Text>
        <Muted>{line.source === 'guest' ? 'Guest cart' : 'Waiter added'}</Muted>
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={onDec} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.stepQty}>{line.quantity}</Text>
        <Pressable onPress={onInc} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
        <Pressable onPress={onRemove} style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Muted>{label}</Muted>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function ActionBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function buildInsightTags(intel: TableIntel | null, eventLabel?: string): string[] {
  const g = intel?.guestIntel;
  const notes = (g?.notes || '').toLowerCase();
  return [
    eventLabel,
    g?.vip ? 'VIP' : '',
    g?.returning ? 'Repeat customer' : '',
    g?.dietary || '',
    g?.allergies ? `Allergy: ${g.allergies}` : '',
    notes.includes('birthday') ? 'Birthday' : '',
    notes.includes('anniversary') ? 'Anniversary' : ''
  ].filter((t): t is string => Boolean(t));
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: theme.colors.gold, fontSize: theme.font.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: theme.colors.text, fontSize: theme.font.xxl, fontWeight: '800' },
  facts: { flexDirection: 'row', gap: theme.space.md },
  fact: { flex: 1, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, padding: theme.space.md, gap: 2 },
  factValue: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '800' },
  panelTitle: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700', marginBottom: 4 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space.sm,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.space.sm
  },
  lineMain: { flex: 1, gap: 2 },
  lineName: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '600' },
  linePrice: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  stepBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  stepText: { color: theme.colors.text, fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepQty: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  removeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: theme.colors.red, fontSize: 15, fontWeight: '700' },
  aiCard: { borderColor: theme.colors.gold },
  aiHead: { color: theme.colors.gold, fontSize: theme.font.sm, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  aiName: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '800', marginTop: 4 },
  aiReason: { color: theme.colors.textDim, fontSize: theme.font.md },
  aiScript: { color: theme.colors.text, fontStyle: 'italic', fontSize: theme.font.md, marginTop: 4 },
  aiFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.space.md },
  aiPrice: { color: theme.colors.gold, fontSize: theme.font.lg, fontWeight: '800' },
  addBtn: { backgroundColor: theme.colors.gold, borderRadius: theme.radius.md, paddingHorizontal: theme.space.lg, paddingVertical: 10 },
  addBtnText: { color: '#1a1408', fontWeight: '800', fontSize: theme.font.md },
  revRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  revName: { color: theme.colors.textDim, fontSize: theme.font.md, flex: 1 },
  revValue: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  revTotal: { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: theme.space.sm },
  revTotalLabel: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700', flex: 1 },
  revTotalValue: { color: theme.colors.gold, fontSize: theme.font.lg, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  action: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center'
  },
  actionText: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  ownerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pressed: { opacity: 0.7 }
});
