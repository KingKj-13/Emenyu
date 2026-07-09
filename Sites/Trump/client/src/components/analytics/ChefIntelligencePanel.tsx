// Phase 6 — Chef Intelligence. Presentation only: reuses the existing analytics
// endpoints and the chef-recs admin list (Phase 3). Two metrics are honestly
// reframed rather than fabricated — see the captions on "premium price tier"
// and "trending up" below.
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../../services/api';
import { formatPrice } from '../../lib/menuUtils';
import type { ChefRec } from '../../types/menu';

type Range = 'today' | '7d' | '30d' | '90d';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 days', days: 6 },
  { key: '30d', label: '30 days', days: 29 },
  { key: '90d', label: '90 days', days: 89 },
];

interface Item { name: string; quantity: number; revenue: number; categoryType?: string }
interface MenuRow { dbId: number; name: string; price: number; category: string }

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
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      : new Date(Date.now() - cfg.days * 86400000).toISOString();
    const windowDays = Math.max(1, cfg.days || 1);
    const recentWindow = rangeFor(windowDays, 0);
    const priorWindow = rangeFor(windowDays, windowDays);

    const [ti, bi, reco, menu, recs, recentItems, priorItems] = await Promise.all([
      api.getAnalyticsItems({ from, to, order: 'desc', limit: 8 }).catch(() => []),
      api.getAnalyticsItems({ from, to, order: 'asc', limit: 8 }).catch(() => []),
      api.getRecommendationAnalytics({ from, to }).catch(() => null),
      api.getAdminMenuItems().catch(() => []),
      api.getChefRecs().catch(() => []),
      api.getAnalyticsItems({ ...recentWindow, order: 'desc', limit: 50 }).catch(() => []),
      api.getAnalyticsItems({ ...priorWindow, order: 'desc', limit: 50 }).catch(() => []),
    ]);

    setTopItems(ti as Item[]);
    setBottomItems(bi as Item[]);
    setChefRecs((recs as ChefRec[]) || []);

    const wine = ((reco?.items || []) as { name?: string; recType?: string; revenue: number; acceptanceRate: number; impressions: number }[])
      .filter(row => (row.recType || '').toUpperCase() === 'WINE')
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map(row => ({ name: row.name || '—', revenue: row.revenue, acceptanceRate: row.acceptanceRate, impressions: row.impressions }));
    setWineItems(wine);

    const menuRows = (menu as MenuRow[]) || [];
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

  if (loading) return <div style={{ padding: 16, opacity: .6 }}>Loading chef intelligence…</div>;

  const activeChefRecs = chefRecs.filter(r => r.active);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Chef Intelligence</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (range === r.key ? '#c6a24b' : '#e7ddc8'),
                background: range === r.key ? 'rgba(198,162,75,0.15)' : '#fff',
                color: range === r.key ? '#8a6d2f' : '#5a4f3d',
              }}
            >{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 22 }}>
        <Tile label="Active chef recs" value={String(activeChefRecs.length)} sub={`${chefRecs.length} total`} />
        <Tile label="Dishes tracked" value={String(topItems.length + bottomItems.length)} />
        <Tile label="Wine pairings with signal" value={String(wineItems.length)} />
        <Tile label="Trending up this week" value={String(trending.length)} />
      </div>

      <TwoUp>
        <Section title="Most ordered dishes">
          <ItemList rows={topItems} empty="No sales yet." />
        </Section>
        <Section title="Least ordered dishes" subtitle="Of dishes that sold at least once">
          <ItemList rows={bottomItems} empty="No sales yet." />
        </Section>
      </TwoUp>

      <TwoUp>
        <Section title="Best wine pairings" subtitle={`Recommended wine, by ${ASSISTANT_LABEL} acceptance & revenue`}>
          {wineItems.length === 0 ? <Empty msg="No wine recommendation activity yet." /> : (
            <List>
              {wineItems.map(w => (
                <Row key={w.name} left={w.name} mid={`${Math.round(w.acceptanceRate * 100)}% accepted`} right={formatPrice(w.revenue)} />
              ))}
            </List>
          )}
        </Section>
        <Section title="Premium price tier" subtitle="Highest-priced dishes — a margin proxy, since no cost data is tracked">
          {premiumItems.length === 0 ? <Empty msg="No menu data." /> : (
            <List>
              {premiumItems.map(m => (
                <Row key={m.dbId} left={m.name} mid={m.category} right={formatPrice(m.price)} />
              ))}
            </List>
          )}
        </Section>
      </TwoUp>

      <Section title="Trending up this week" subtitle="Dishes selling more than the prior period — a real order-velocity comparison, not a seasonal calendar">
        {trending.length === 0 ? <Empty msg="Nothing trending up yet — not enough repeat sales history." /> : (
          <List>
            {trending.map(t => (
              <Row key={t.name} left={t.name} mid={`${t.prior} → ${t.recent}`} right={`+${t.delta}`} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Chef recommendations" subtitle="Active pairing rules (Menu & Offers → Chef Recs)">
        {activeChefRecs.length === 0 ? <Empty msg="No active chef recommendations." /> : (
          <List>
            {activeChefRecs.slice(0, 10).map(r => (
              <Row key={r.id} left={`${r.sourceName} → ${r.targetName}`} mid={r.recType} right={r.reason ? r.reason.slice(0, 40) : ''} />
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}

const ASSISTANT_LABEL = 'the sommelier';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7ddc8', borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1206', lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9b8a66', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#8a6d2f', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TwoUp({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 18 }}>{children}</div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <h4 style={{ margin: '0 0 2px' }}>{title}</h4>
      {subtitle && <p style={{ margin: '0 0 8px', fontSize: 11.5, opacity: .6 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>;
}

function Row({ left, mid, right }: { left: string; mid?: string; right?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '4px 0', borderTop: '1px solid #f0e9d8' }}>
      <span style={{ color: '#1a1206', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
      {mid && <span style={{ color: '#9b8a66', fontSize: 11.5 }}>{mid}</span>}
      {right && <span style={{ color: '#8a6d2f', fontWeight: 700 }}>{right}</span>}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ padding: '12px 0', opacity: .5, fontSize: 12.5 }}>{msg}</div>;
}

function ItemList({ rows, empty }: { rows: Item[]; empty: string }) {
  if (!rows || rows.length === 0) return <Empty msg={empty} />;
  return (
    <List>
      {rows.map((it, i) => (
        <Row key={it.name} left={`#${i + 1} ${it.name}`} mid={`${it.quantity}×`} right={formatPrice(it.revenue)} />
      ))}
    </List>
  );
}
