// Add Items — browse/search the live menu and add lines to the active table's order
// (parity with the web waiter's Add Items view). Read-only against the menu; adds go
// into the shared waiter-order state and are fired to the kitchen from Table Detail.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Muted, EmptyState } from '../components/ui';
import { theme } from '../components/theme';
import { menuApi } from '../api/menu';
import { readThrough } from '../services/offline';
import { useWaiterOrder } from '../waiter/WaiterOrderContext';
import { money, tableNum } from '../lib/format';
import type { MenuItem } from '../types/api';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AddItems'>;

const ALL = 'All';

function categoryOf(item: MenuItem): string {
  return (item.category || item.categoryType || item.subcategory || 'Other').trim();
}

export function AddItemsScreen({ route, navigation }: Props) {
  const { tableId } = route.params;
  const { addToOrder, showToast, order } = useWaiterOrder();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(ALL);

  useEffect(() => {
    navigation.setOptions({ title: `Add · Table ${tableNum(tableId)}` });
    let alive = true;
    (async () => {
      const res = await readThrough<MenuItem[]>('menu_items', () => menuApi.getItems());
      if (!alive) return;
      setItems(res.data ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [tableId]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const it of items) seen.add(categoryOf(it));
    return [ALL, ...Array.from(seen).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => it.available !== false)
      .filter((it) => (cat === ALL ? true : categoryOf(it).toLowerCase() === cat.toLowerCase()))
      .filter((it) => (q ? `${it.name} ${it.description || ''} ${categoryOf(it)}`.toLowerCase().includes(q) : true))
      .slice(0, 120);
  }, [items, query, cat]);

  const cartCount = order.reduce((s, l) => s + l.quantity, 0);

  return (
    <Screen refreshing={loading} onRefresh={() => menuApi.getItems().then(setItems).catch(() => undefined)}>
      <View style={styles.search}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${items.length} items`}
          placeholderTextColor={theme.colors.textDim}
          autoCorrect={false}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {categories.map((c) => (
          <Pressable key={c} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipActive]}>
            <Text style={[styles.chipText, cat === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState title={loading ? 'Loading menu…' : 'No items match'} />
      ) : (
        filtered.map((it) => (
          <Pressable
            key={String(it.id)}
            onPress={() => {
              addToOrder({ name: it.name, price: it.price || 0, img: it.img, category: it.category, categoryType: it.categoryType });
              showToast(`Added ${it.name}`);
            }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={styles.itemMain}>
              <Text style={styles.itemName}>{it.name}</Text>
              <Muted>{categoryOf(it)}</Muted>
            </View>
            <Text style={styles.itemPrice}>{money(it.price)}</Text>
            <View style={styles.addPill}>
              <Text style={styles.addPillText}>+</Text>
            </View>
          </Pressable>
        ))
      )}

      <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
        <Text style={styles.doneText}>Done{cartCount ? ` · ${cartCount} in cart` : ''}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  rail: { gap: theme.space.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md, paddingVertical: 8, backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold },
  chipText: { color: theme.colors.textDim, fontSize: theme.font.sm, fontWeight: '700' },
  chipTextActive: { color: '#1a1408' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  itemPrice: { color: theme.colors.text, fontSize: theme.font.md, fontWeight: '700' },
  addPill: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.gold, alignItems: 'center', justifyContent: 'center' },
  addPillText: { color: '#1a1408', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  done: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.gold, borderWidth: 1, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: 'center', marginTop: theme.space.sm },
  doneText: { color: theme.colors.gold, fontSize: theme.font.md, fontWeight: '800' },
  pressed: { opacity: 0.7 }
});
