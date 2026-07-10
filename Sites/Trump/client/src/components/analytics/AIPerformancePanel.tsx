// Phase 6 — AI Performance dashboard. Presentation only: every number here comes
// straight from the existing recommendation-analytics endpoints (Phase 4 event
// pipeline + Phase 6's recType/pairings additions). No recommendation logic lives
// here and nothing here feeds back into the engine.
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { formatPrice } from '../../lib/menuUtils';
import { sastTodayStartIso } from '../../lib/businessDay';
import { ASSISTANT_NAME } from '../../constants/config';
import type { RecommendationAnalytics, RecoInsightsResult, RecoTally } from '../../types/menu';
import styles from './AnalyticsPanels.module.css';

type Range = 'today' | '7d' | '30d' | '90d';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 days', days: 6 },
  { key: '30d', label: '30 days', days: 29 },
  { key: '90d', label: '90 days', days: 89 },
];

function dateRange(r: Range) {
  const cfg = RANGES.find(x => x.key === r)!;
  const now = new Date();
  const to = now.toISOString();
  const from = cfg.days === 0
    ? sastTodayStartIso()
    : new Date(Date.now() - cfg.days * 86400000).toISOString();
  return { from, to };
}

const pct = (v?: number) => `${Math.round((v || 0) * 100)}%`;
// Same severity palette as OwnerDashboard's Insight component — one shared
// convention across every "what to act on" panel in the app.
const SEVERITY: Record<string, string> = { high: '#e0696b', medium: '#c8a555', low: '#6f9a7a' };

export function AIPerformancePanel() {
  const [range, setRange] = useState<Range>('7d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecommendationAnalytics | null>(null);
  const [insights, setInsights] = useState<RecoInsightsResult | null>(null);
  const [ratings, setRatings] = useState<{ average: number; count: number } | null>(null);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    const { from, to } = dateRange(r);
    const [d, i, rt] = await Promise.all([
      api.getRecommendationAnalytics({ from, to }).catch(() => null),
      api.getRecommendationInsights({ from, to }).catch(() => null),
      api.getRatings({ from, to }).catch(() => null),
    ]);
    setData(d);
    setInsights(i);
    setRatings(rt as { average: number; count: number } | null);
    setLoading(false);
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  if (loading) return <div className={styles.loading}>Loading AI performance…</div>;
  if (!data) return <div className={styles.empty}>No recommendation data available yet.</div>;

  const t = data.totals;
  // Grouped by the recType the engine actually tags each event with — the
  // stored analytics data has no separate "was this a replacement" boolean, so
  // rather than fabricate one, we group honestly by recType. 'UPGRADE' rows
  // are item upgrades (a Wagyu instead of the regular cut); everything else is
  // an additional item suggested alongside the order.
  const byType = new Map<string, { value: number; ordered: number }>();
  for (const row of data.items || []) {
    const key = (row.recType || 'OTHER').toUpperCase();
    const cur = byType.get(key) || { value: 0, ordered: 0 };
    cur.value += row.revenue || 0;
    cur.ordered += row.ordered || 0;
    byType.set(key, cur);
  }
  const upgradeValue = byType.get('UPGRADE')?.value || 0;
  const addOnValue = [...byType.entries()].filter(([k]) => k !== 'UPGRADE').reduce((s, [, v]) => s + v.value, 0);
  const topRec = (data.topRevenue || [])[0];
  const bestPairing = (data.topConverting || [])[0];

  return (
    <div>
      <div className={styles.head}>
        <h3 className={styles.title}>AI Performance</h3>
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
        <Tile label="Recommendations made" value={String(t.impressions)} />
        <Tile label="Accepted" value={pct(t.acceptanceRate)} sub={`${t.accepted} of ${t.impressions}`} />
        <Tile label="Revenue generated" value={formatPrice(t.revenue)} sub={`${t.ordered} orders`} />
        <Tile label="Revenue / impression" value={formatPrice(t.revenuePerImpression || 0)} />
        <Tile label="Additional items suggested" value={formatPrice(addOnValue)} sub="pairings, sides, desserts" />
        <Tile label="Item upgrades" value={formatPrice(upgradeValue)} sub="e.g. Wagyu over standard cut" />
        <Tile label="Guest satisfaction estimate" value={ratings && ratings.count > 0 ? `${ratings.average.toFixed(1)} / 5` : '—'} sub={ratings && ratings.count > 0 ? `${ratings.count} reviews` : 'no reviews yet'} />
        <Tile label={`Top ${ASSISTANT_NAME} recommendation`} value={topRec ? topRec.name || '—' : '—'} sub={topRec ? formatPrice(topRec.revenue) : undefined} />
      </div>

      {bestPairing && (
        <div className={styles.callout}>
          <span className={styles.calloutLabel}>Best-converting recommendation:</span>{' '}
          {bestPairing.name} — {pct(bestPairing.acceptanceRate)} acceptance, {formatPrice(bestPairing.revenue)} revenue
        </div>
      )}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Top-earning recommendations</h4>
        <RecoTable rows={data.topRevenue} empty="No recommendation revenue in this period." />
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>By source</h4>
        <RecoTable rows={data.bySource} empty="No data in this period." labelKey="source" />
      </div>

      {insights && insights.insights.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>What to act on</h4>
          <div className={styles.list} style={{ gap: 8 }}>
            {insights.insights.slice(0, 6).map((ins, i) => (
              <div key={i} className={styles.insight} style={{ borderLeft: `3px solid ${SEVERITY[ins.severity] || '#9aa6b2'}` }}>
                <div className={styles.insightTitle}><strong>{ins.title}</strong></div>
                <div className={styles.insightDetail}>{ins.detail}</div>
                {ins.action && <div className={styles.insightAction}>→ {ins.action}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={styles.footnote}>
        Average recommendation confidence isn't shown — the engine doesn't persist a confidence value per event, so rather than
        show a fabricated number, acceptance rate and revenue per impression (above) serve as the honest, observable proxies.
      </p>
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

function RecoTable({ rows, empty, labelKey = 'name' }: { rows: RecoTally[]; empty: string; labelKey?: 'name' | 'source' }) {
  if (!rows || rows.length === 0) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{labelKey === 'source' ? 'Source' : 'Item'}</th>
            <th>Shown</th>
            <th>Accepted</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((r, i) => (
            <tr key={i}>
              <td>{labelKey === 'source' ? r.source : r.name}</td>
              <td>{r.impressions}</td>
              <td>{pct(r.acceptanceRate)}</td>
              <td className={styles.tableRev}>{formatPrice(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
