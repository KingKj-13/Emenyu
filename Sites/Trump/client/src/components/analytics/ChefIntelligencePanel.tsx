// Phase 6 — Chef Intelligence. Presentation only: reuses the existing analytics
// endpoints and the chef-recs admin list (Phase 3). Two metrics are honestly
// reframed rather than fabricated — see the captions on "premium price tier"
// and "trending up" below.
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../../services/api';
import { formatPrice } from '../../lib/menuUtils';
import { sastTodayStartIso } from '../../lib/businessDay';
import { ASSISTANT_NAME } from '../../constants/config';
import type { ChefRec } from '../../types/menu';
import styles from './AnalyticsPanels.module.css';

type Range = 'today' | '7d' | '30d' | '90d';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 days', days: 6 },
  { key: '30d', label: '30 days', days: 29 },
  { key: '90d', label: '90 days', days: 89 },
];

interface Item { name: string; quantity: number; revenue: number; categoryType?: string }
interface MenuRow { dbId: number; name: string; price: number; category: string; categoryType?: string }

function rangeFor(days: number, offsetDays = 0) {
  const to = new Date(Date.now() - offsetDays * 86400000);
  const from = new Date(to.getTime() - days * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function ChefIntelligencePanel() {
  const [range, setRange] = useState<Range>('30d');
  const [loading, setLoading] = useState(true);
  const [topItems, setTopItems] = useState<Item[]>([]);
  const [bottomItems, setBottomItems] = useState<Item[]>([]);
  const [topDrinks, setTopDrinks] = useState<Item[]>([]);
  const [wineItems, setWineItems] = useState<{ name: string; revenue: number; acceptanceRate: number; impressions: number }[]>([]);
  const [premiumItems, setPremiumItems] = useState<MenuRow[]>([]);
  const [chefRecs, setChefRecs] = useState<ChefRec[]>([]);
  const [trending, setTrending] = useState<{ name: string; recent: number; prior: number; delta: number }[]>([]);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    const cfg = RANGES.find(x => x.key === r)!;
    const now = new Date();
    const to = now.toISOString();
    const from = cfg.days === 0
      ? sastTodayStartIso()
      : new Date(Date.now() - cfg.days * 86400000).toISOString();
    const windowDays = Math.max(1, cfg.days || 1);
    const recentWindow = rangeFor(windowDays, 0);
    const priorWindow = rangeFor(windowDays, windowDays);

    // "Dishes" here must never include drinks — excludeCategory pulls a wider
    // pool server-side and filters before slicing to the display limit.
    const [ti, bi, di, reco, menu, recs, recentItems, priorItems] = await Promise.all([
      api.getAnalyticsItems({ from, to, order: 'desc', limit: 8, excludeCategory: 'WINE,DRINK' }).catch(() => []),
      api.getAnalyticsItems({ from, to, order: 'asc', limit: 8, excludeCategory: 'WINE,DRINK' }).catch(() => []),
      api.getAnalyticsItems({ from, to, order: 'desc', limit: 8, category: 'WINE,DRINK' }).catch(() => []),
      api.getRecommendationAnalytics({ from, to }).catch(() => null),
      api.getAdminMenuItems().catch(() => []),
      api.getChefRecs().catch(() => []),
      api.getAnalyticsItems({ ...recentWindow, order: 'desc', limit: 50, excludeCategory: 'WINE,DRINK' }).catch(() => []),
      api.getAnalyticsItems({ ...priorWindow, order: 'desc', limit: 50, excludeCategory: 'WINE,DRINK' }).catch(() => []),
    ]);

    setTopItems(ti as Item[]);
    setBottomItems(bi as Item[]);
    setTopDrinks(di as Item[]);
    setChefRecs((recs as ChefRec[]) || []);

    const wine = ((reco?.items || []) as { name?: string; recType?: string; revenue: number; acceptanceRate: number; impressions: number }[])
      .filter(row => (row.recType || '').toUpperCase() === 'WINE')
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map(row => ({ name: row.name || '—', revenue: row.revenue, acceptanceRate: row.acceptanceRate, impressions: row.impressions }));
    setWineItems(wine);

    // "Highest-priced dishes" — exclude wine/spirits so a premium bottle
    // doesn't get labeled a dish.
    const menuRows = ((menu as MenuRow[]) || []).filter(m => m.categoryType !== 'WINE' && m.categoryType !== 'DRINK');
    setPremiumItems([...menuRows].sort((a, b) => b.price - a.price).slice(0, 8));

    const priorMap = new Map((priorItems as Item[]).map(i => [i.name, i.quantity]));
    const trend = (recentItems as Item[])
      .map(i => ({ name: i.name, recent: i.quantity, prior: priorMap.get(i.name) || 0, delta: i.quantity - (priorMap.get(i.name) || 0) }))
      .filter(t => t.delta > 0 && t.prior > 0) // only items that were already selling AND are climbing — not brand-new one-offs
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6);
    setTrending(trend);

    setLoading(false);
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  if (loading) return <div className={styles.loading}>Loading chef intelligence…</div>;

  const activeChefRecs = chefRecs.filter(r => r.active);

  return (
    <div>
      <div className={styles.head}>
        <h3 className={styles.title}>Chef Intelligence</h3>
        <div className={styles.rangeBar}>
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`${styles.rangeBtn} ${range === r.key ? styles.rangeBtnActive : ''}`}
              onClick={() => setRange(r.key)}
            >{r.label}</button>
          ))}
        </div>
      </div>

      <div className={styles.tileGrid}>
        <Tile label="Active chef recs" value={String(activeChefRecs.length)} sub={`${chefRecs.length} total`} />
        <Tile label="Dishes tracked" value={String(topItems.length + bottomItems.length)} />
        <Tile label="Wine pairings with signal" value={String(wineItems.length)} />
        <Tile label="Trending up this week" value={String(trending.length)} />
      </div>

      <div className={styles.twoUp}>
        <Section title="Most ordered dishes">
          <ItemList rows={topItems} empty="No sales yet." />
        </Section>
        <Section title="Least ordered dishes" subtitle="Of dishes that sold at least once">
          <ItemList rows={bottomItems} empty="No sales yet." />
        </Section>
      </div>

      <Section title="Most ordered drinks" subtitle="Wine, cocktails and other beverages">
        <ItemList rows={topDrinks} empty="No drink sales yet." />
      </Section>

      <div className={styles.twoUp}>
        <Section title="Best wine pairings" subtitle={`Recommended wine, by ${ASSISTANT_NAME} acceptance & revenue`}>
          {wineItems.length === 0 ? <Empty msg="No wine recommendation activity yet." /> : (
            <div className={styles.list}>
              {wineItems.map(w => (
                <Row key={w.name} left={w.name} mid={`${Math.round(w.acceptanceRate * 100)}% accepted`} right={formatPrice(w.revenue)} />
              ))}
            </div>
          )}
        </Section>
        <Section title="Premium price tier" subtitle="Highest-priced dishes — a margin proxy, since no cost data is tracked">
          {premiumItems.length === 0 ? <Empty msg="No menu data." /> : (
            <div className={styles.list}>
              {premiumItems.map(m => (
                <Row key={m.dbId} left={m.name} mid={m.category} right={formatPrice(m.price)} />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Trending up this week" subtitle="Dishes selling more than the prior period — a real order-velocity comparison, not a seasonal calendar">
        {trending.length === 0 ? <Empty msg="Nothing trending up yet — not enough repeat sales history." /> : (
          <div className={styles.list}>
            {trending.map(t => (
              <Row key={t.name} left={t.name} mid={`${t.prior} → ${t.recent}`} right={`+${t.delta}`} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Chef recommendations" subtitle="Active pairing rules (Menu & Offers → Chef Recs)">
        {activeChefRecs.length === 0 ? <Empty msg="No active chef recommendations." /> : (
          <div className={styles.list}>
            {activeChefRecs.slice(0, 10).map(r => (
              <Row key={r.id} left={`${r.sourceName} → ${r.targetName}`} mid={r.recType} right={r.reason ? r.reason.slice(0, 40) : ''} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileValue}>{value}</div>
      <div className={styles.tileLabel}>{label}</div>
      {sub && <div className={styles.tileSub}>{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {subtitle && <p className={styles.sectionSub}>{subtitle}</p>}
      {children}
    </div>
  );
}

function Row({ left, mid, right }: { left: string; mid?: string; right?: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowName}>{left}</span>
      {mid && <span className={styles.rowMeta}>{mid}</span>}
      {right && <span className={styles.rowValue}>{right}</span>}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className={styles.empty}>{msg}</div>;
}

function ItemList({ rows, empty }: { rows: Item[]; empty: string }) {
  if (!rows || rows.length === 0) return <Empty msg={empty} />;
  return (
    <div className={styles.list}>
      {rows.map((it, i) => (
        <Row key={it.name} left={`#${i + 1} ${it.name}`} mid={`${it.quantity}×`} right={formatPrice(it.revenue)} />
      ))}
    </div>
  );
}
