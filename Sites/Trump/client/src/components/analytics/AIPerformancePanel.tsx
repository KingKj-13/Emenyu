// Phase 6 — AI Performance dashboard. Presentation only: every number here comes
// straight from the existing recommendation-analytics endpoints (Phase 4 event
// pipeline + Phase 6's recType/pairings additions). No recommendation logic lives
// here and nothing here feeds back into the engine.
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { formatPrice } from '../../lib/menuUtils';
import { ASSISTANT_NAME } from '../../constants/config';
import type { RecommendationAnalytics, RecoInsightsResult, RecoTally } from '../../types/menu';

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
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    : new Date(Date.now() - cfg.days * 86400000).toISOString();
  return { from, to };
}

const pct = (v?: number) => `${Math.round((v || 0) * 100)}%`;

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

  if (loading) return <div style={{ padding: 16, opacity: .6 }}>Loading AI performance…</div>;
  if (!data) return <div style={{ padding: 16, opacity: .6 }}>No recommendation data available.</div>;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>AI Performance</h3>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
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
        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(198,162,75,0.08)', border: '1px solid rgba(198,162,75,0.25)' }}>
          <strong style={{ fontSize: 13 }}>Best-converting recommendation:</strong>{' '}
          <span style={{ fontSize: 13 }}>{bestPairing.name} — {pct(bestPairing.acceptanceRate)} acceptance, {formatPrice(bestPairing.revenue)} revenue</span>
        </div>
      )}

      <h4 style={{ marginTop: 22, marginBottom: 8 }}>Top-earning recommendations</h4>
      <RecoTable rows={data.topRevenue} empty="No recommendation revenue in this period." />

      <h4 style={{ marginTop: 22, marginBottom: 8 }}>By source</h4>
      <RecoTable rows={data.bySource} empty="No data in this period." labelKey="source" />

      {insights && insights.insights.length > 0 && (
        <>
          <h4 style={{ marginTop: 22, marginBottom: 8 }}>What to act on</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.insights.slice(0, 6).map((ins, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #e7ddc8', borderLeft: `3px solid ${ins.severity === 'high' ? '#c0392b' : ins.severity === 'medium' ? '#c6a24b' : '#6f9a7a'}` }}>
                <strong style={{ fontSize: 13 }}>{ins.title}</strong>
                <div style={{ fontSize: 12, opacity: .75 }}>{ins.detail}</div>
                {ins.action && <div style={{ fontSize: 12, color: '#8a6d2f', marginTop: 2 }}>→ {ins.action}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ marginTop: 18, fontSize: 11, opacity: .55, fontStyle: 'italic' }}>
        Average recommendation confidence isn't shown — the engine doesn't persist a confidence value per event, so rather than
        show a fabricated number, acceptance rate and revenue per impression (above) serve as the honest, observable proxies.
      </p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7ddc8', borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1206', lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9b8a66', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#8a6d2f', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function RecoTable({ rows, empty, labelKey = 'name' }: { rows: RecoTally[]; empty: string; labelKey?: 'name' | 'source' }) {
  if (!rows || rows.length === 0) return <div style={{ padding: 12, opacity: .5, fontSize: 13 }}>{empty}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#9b8a66', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <th style={{ padding: '8px 10px' }}>{labelKey === 'source' ? 'Source' : 'Item'}</th>
            <th style={{ padding: '8px 10px' }}>Shown</th>
            <th style={{ padding: '8px 10px' }}>Accepted</th>
            <th style={{ padding: '8px 10px' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f0e9d8' }}>
              <td style={{ padding: '8px 10px' }}>{labelKey === 'source' ? r.source : r.name}</td>
              <td style={{ padding: '8px 10px' }}>{r.impressions}</td>
              <td style={{ padding: '8px 10px' }}>{pct(r.acceptanceRate)}</td>
              <td style={{ padding: '8px 10px', fontWeight: 700, color: '#8a6d2f' }}>{formatPrice(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
