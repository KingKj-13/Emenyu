// Owner / BI dashboard — a decluttered, mobile-first view for the owner role.
// It REUSES the existing analytics endpoints (summary / items / tables / hours /
// trend / day-of-week / ratings) and the recommendation analytics + insight
// engine — no analytics are re-implemented here; this file only fetches and frames
// data the server already computes. Operational depth still lives in /Admin.
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Star, LogOut, Sparkles, SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { formatPrice } from '../lib/menuUtils';
import { ASSISTANT_NAME } from '../constants/config';
import type { RecommendationAnalytics, RecoInsightsResult } from '../types/menu';
import styles from './OwnerDashboard.module.css';

// ── response shapes (typing the existing endpoints; not re-deriving them) ──
interface Summary { revenue: number; orderCount: number; avgOrderValue: number; topTable: string | null; topTableRevenue: number; covers?: number; avgPerCover?: number }
interface Item { name: string; quantity: number; revenue: number }
interface Hour { hour: number; count: number }
interface Dow { dow: number; label: string; count: number; revenue: number }
interface TrendPoint { date: string; revenue: number; orders: number }
interface RatingRow { id: number; rating: number; comment: string; tableId: string; createdAt: string }
interface Ratings { average: number; count: number; recent: RatingRow[] }

type RangeKey = 'today' | '7d' | '30d' | '90d';
const RANGES: { key: RangeKey; label: string; days: number; bucket: 'day' | 'week' }[] = [
  { key: 'today', label: 'Today', days: 0, bucket: 'day' },
  { key: '7d', label: '7 days', days: 6, bucket: 'day' },
  { key: '30d', label: '30 days', days: 29, bucket: 'day' },
  { key: '90d', label: '90 days', days: 89, bucket: 'week' },
];

function rangeParams(r: RangeKey) {
  const cfg = RANGES.find(x => x.key === r)!;
  const now = new Date();
  // `to` must be the current moment (not date-only midnight), else today's orders
  // — which are timestamped after 00:00 — get excluded. Mirrors AdminPage.
  const to = now.toISOString();
  const from = cfg.days === 0
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    : new Date(Date.now() - cfg.days * 86400000).toISOString();
  return { from, to, bucket: cfg.bucket };
}
function shortDate(key: string) {
  // key is YYYY-MM-DD (day/week) or YYYY-MM (month)
  const parts = key.split('-');
  if (parts.length === 2) return `${parts[0]}/${parts[1]}`;
  return `${parts[2]}/${parts[1]}`;
}

export function OwnerDashboard() {
  const { user, logout } = useAuth();
  const [range, setRange] = useState<RangeKey>('today');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topItems, setTopItems] = useState<Item[]>([]);
  const [bottomItems, setBottomItems] = useState<Item[]>([]);
  const [hours, setHours] = useState<Hour[]>([]);
  const [dow, setDow] = useState<Dow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [ratings, setRatings] = useState<Ratings | null>(null);
  const [reco, setReco] = useState<RecommendationAnalytics | null>(null);
  const [recoInsights, setRecoInsights] = useState<RecoInsightsResult | null>(null);

  const load = useCallback(async (r: RangeKey) => {
    setLoading(true);
    const { from, to, bucket } = rangeParams(r);
    const p = { from, to };
    const [s, ti, bi, h, dw, tr, rt, ra, ri] = await Promise.all([
      api.getAnalyticsSummary(p).catch(() => null),
      api.getAnalyticsItems({ ...p, order: 'desc' }).catch(() => []),
      api.getAnalyticsItems({ ...p, order: 'asc' }).catch(() => []),
      api.getAnalyticsHours(p).catch(() => []),
      api.getAnalyticsDayOfWeek(p).catch(() => []),
      api.getAnalyticsTrend({ ...p, bucket }).catch(() => ({ bucket, points: [] })),
      api.getRatings(p).catch(() => null),
      api.getRecommendationAnalytics({ from, to }).catch(() => null),
      api.getRecommendationInsights({ from, to }).catch(() => null),
    ]);
    setSummary(s as Summary | null);
    setTopItems(ti as Item[]);
    setBottomItems(bi as Item[]);
    setHours(h as Hour[]);
    setDow(dw as Dow[]);
    setTrend((tr as { points: TrendPoint[] })?.points || []);
    setRatings(rt as Ratings | null);
    setReco(ra as RecommendationAnalytics | null);
    setRecoInsights(ri as RecoInsightsResult | null);
    setLoading(false);
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const totals = reco?.totals;
  const donaldRevenue = totals?.revenue || 0;
  const covers = summary?.covers || 0;
  const avgPerCover = covers > 0 ? (summary!.revenue / covers) : 0;

  // A few light, plain-English callouts derived from the server's own aggregates.
  const businessInsights = buildBusinessInsights(dow, reco);

  return (
    <AppShell requireRole="owner" hideHeader>
      <div className={styles.page}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandTitle}>TRUMPS</span>
            <span className={styles.brandSub}>OWNER DASHBOARD</span>
          </div>
          <div className={styles.topActions}>
            <Link to="/Admin" className={styles.adminLink}><SlidersHorizontal size={14} /> Admin console</Link>
            <button className={styles.signOut} onClick={logout}><LogOut size={14} /> Sign out</button>
          </div>
        </header>

        <div className={styles.rangeBar}>
          {RANGES.map(r => (
            <button key={r.key} className={`${styles.rangeBtn} ${range === r.key ? styles.rangeBtnActive : ''}`} onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}><Spinner size={40} /></div>
        ) : (
          <>
            {/* Hero — the recommendation ROI story */}
            <section className={styles.hero}>
              <div className={styles.heroIcon}><Sparkles size={20} /></div>
              <div className={styles.heroBody}>
                <div className={styles.heroLabel}>{ASSISTANT_NAME.toUpperCase()} ADDED TO YOUR TICKETS</div>
                <div className={styles.heroValue}>{formatPrice(donaldRevenue)}</div>
                <div className={styles.heroSub}>
                  {totals
                    ? `${totals.ordered} orders generated · ${pct(totals.acceptanceRate)} acceptance · ${formatPrice(totals.revenuePerImpression || 0)}/impression`
                    : 'No recommendation events in this period yet.'}
                </div>
              </div>
            </section>

            {/* KPI strip */}
            <section className={styles.kpiGrid}>
              <Kpi value={formatPrice(summary?.revenue || 0)} label="Revenue" />
              <Kpi value={String(summary?.orderCount || 0)} label="Orders" />
              <Kpi value={formatPrice(summary?.avgOrderValue || 0)} label="Avg order" />
              <Kpi value={covers > 0 ? String(covers) : '—'} label="Covers" hint={covers > 0 ? undefined : 'captured at seating'} />
              <Kpi value={avgPerCover > 0 ? formatPrice(avgPerCover) : '—'} label="Avg / cover" />
              <Kpi value={summary?.topTable ? summary.topTable.replace(/^table/i, 'Table ') : '—'} label="Top table" sub={summary?.topTableRevenue ? formatPrice(summary.topTableRevenue) : ''} />
            </section>

            {/* Revenue trend */}
            <Panel title="Revenue trend">
              {trend.length === 0 ? <Empty msg="No revenue in this period." /> : (
                <div className={styles.trend}>
                  {(() => {
                    const max = Math.max(...trend.map(t => t.revenue), 1);
                    return trend.map(t => (
                      <div key={t.date} className={styles.trendCol} title={`${t.date} — ${formatPrice(t.revenue)} (${t.orders} orders)`}>
                        <div className={styles.trendBar} style={{ height: `${(t.revenue / max) * 100}%` }} />
                        <span className={styles.trendLabel}>{shortDate(t.date)}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </Panel>

            {/* Peak hours + day of week */}
            <div className={styles.twoUp}>
              <Panel title="Peak hours">
                {hours.some(h => h.count > 0) ? (
                  <div className={styles.bars}>
                    {(() => {
                      const max = Math.max(...hours.map(h => h.count), 1);
                      return hours.map(h => (
                        <div key={h.hour} className={styles.barCol} title={`${h.hour}:00 — ${h.count} orders`}>
                          <div className={styles.bar} style={{ height: `${(h.count / max) * 100}%` }} />
                          {h.hour % 6 === 0 && <span className={styles.barLabel}>{h.hour}h</span>}
                        </div>
                      ));
                    })()}
                  </div>
                ) : <Empty msg="No orders yet." />}
              </Panel>

              <Panel title="By day of week">
                {dow.some(d => d.count > 0) ? (
                  <div className={styles.bars}>
                    {(() => {
                      const max = Math.max(...dow.map(d => d.count), 1);
                      return dow.map(d => (
                        <div key={d.dow} className={styles.barCol} title={`${d.label} — ${d.count} orders · ${formatPrice(d.revenue)}`}>
                          <div className={`${styles.bar} ${styles.barGold}`} style={{ height: `${(d.count / max) * 100}%` }} />
                          <span className={styles.barLabel}>{d.label}</span>
                        </div>
                      ));
                    })()}
                  </div>
                ) : <Empty msg="No orders yet." />}
              </Panel>
            </div>

            {/* Top & bottom dishes */}
            <div className={styles.twoUp}>
              <Panel title="Top dishes">
                <DishList rows={topItems} empty="No sales yet." />
              </Panel>
              <Panel title="Bottom dishes" subtitle="Least ordered (of items that sold)">
                <DishList rows={bottomItems} empty="No sales yet." />
              </Panel>
            </div>

            {/* Recommendation funnel (compact) */}
            <Panel title={`${ASSISTANT_NAME}'s funnel`} subtitle="Shown → tapped → added → ordered">
              {totals && totals.impressions > 0 ? (
                <div className={styles.funnel}>
                  <FunnelStep value={totals.impressions} label="Shown" />
                  <FunnelStep value={totals.clicks} label="Tapped" sub={pct(totals.clickRate)} />
                  <FunnelStep value={totals.accepted} label="Added" sub={pct(totals.acceptanceRate)} />
                  <FunnelStep value={totals.ordered} label="Ordered" sub={formatPrice(totals.revenue)} gold />
                </div>
              ) : <Empty msg="No recommendation events yet." />}
            </Panel>

            {/* Ratings */}
            <Panel title="Guest ratings">
              {ratings && ratings.count > 0 ? (
                <div className={styles.ratings}>
                  <div className={styles.ratingHead}>
                    <span className={styles.ratingBig}>{ratings.average.toFixed(1)}</span>
                    <span className={styles.ratingStars}>
                      {[1, 2, 3, 4, 5].map(s => <Star key={s} size={15} fill={s <= Math.round(ratings.average) ? 'currentColor' : 'none'} />)}
                    </span>
                    <span className={styles.ratingCount}>{ratings.count} review{ratings.count !== 1 ? 's' : ''}</span>
                  </div>
                  {ratings.recent.filter(r => r.comment).slice(0, 5).map(r => (
                    <div key={r.id} className={styles.ratingRow}>
                      <span className={styles.ratingRowStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                      <p className={styles.ratingComment}>{r.comment}</p>
                    </div>
                  ))}
                </div>
              ) : <Empty msg="No ratings in this period." />}
            </Panel>

            {/* Insights — plain English */}
            {(businessInsights.length > 0 || (recoInsights?.insights?.length || 0) > 0) && (
              <Panel title="What to act on">
                <div className={styles.insights}>
                  {businessInsights.map((ins, i) => (
                    <Insight key={`b${i}`} severity={ins.severity} title={ins.title} detail={ins.detail} />
                  ))}
                  {(recoInsights?.insights || []).slice(0, 5).map((ins, i) => (
                    <Insight key={`r${i}`} severity={ins.severity} title={ins.title} detail={ins.detail} action={ins.action} />
                  ))}
                </div>
              </Panel>
            )}

            <Link to="/Admin" className={styles.fullLink}>Open full analytics & operations in the admin console <ArrowUpRight size={14} /></Link>
          </>
        )}
      </div>
    </AppShell>
  );
}

// ── small presentational helpers (presentation only — no aggregation) ──
function pct(r?: number) { return `${Math.round((Number(r) || 0) * 100)}%`; }

function Kpi({ value, label, sub, hint }: { value: string; label: string; sub?: string; hint?: string }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
      {hint && <div className={styles.kpiHint}>{hint}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {subtitle && <span className={styles.panelSub}>{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className={styles.empty}><TrendingUp size={22} /><span>{msg}</span></div>;
}

function DishList({ rows, empty }: { rows: Item[]; empty: string }) {
  if (!rows || rows.length === 0) return <Empty msg={empty} />;
  return (
    <div className={styles.dishList}>
      {rows.slice(0, 7).map((it, i) => (
        <div key={it.name} className={styles.dishRow}>
          <span className={styles.dishRank}>#{i + 1}</span>
          <span className={styles.dishName}>{it.name}</span>
          <span className={styles.dishQty}>{it.quantity}×</span>
          <span className={styles.dishRev}>{formatPrice(it.revenue)}</span>
        </div>
      ))}
    </div>
  );
}

function FunnelStep({ value, label, sub, gold }: { value: number; label: string; sub?: string; gold?: boolean }) {
  return (
    <div className={`${styles.funnelStep} ${gold ? styles.funnelGold : ''}`}>
      <div className={styles.funnelValue}>{value}</div>
      <div className={styles.funnelLabel}>{label}</div>
      {sub && <div className={styles.funnelSub}>{sub}</div>}
    </div>
  );
}

const SEVERITY: Record<string, string> = { high: '#e0696b', medium: '#c6a24b', low: '#6f9a7a' };
function Insight({ severity, title, detail, action }: { severity: string; title: string; detail: string; action?: string }) {
  return (
    <div className={styles.insight} style={{ borderLeftColor: SEVERITY[severity] || '#9aa6b2' }}>
      <strong className={styles.insightTitle}>{title}</strong>
      <span className={styles.insightDetail}>{detail}</span>
      {action && <span className={styles.insightAction}>→ {action}</span>}
    </div>
  );
}

// Plain-English callouts derived from already-aggregated server data.
function buildBusinessInsights(dow: Dow[], reco: RecommendationAnalytics | null) {
  const out: { severity: string; title: string; detail: string }[] = [];
  const active = dow.filter(d => d.count > 0);
  if (active.length >= 3) {
    const busiest = [...active].sort((a, b) => b.count - a.count)[0];
    const slowest = [...active].sort((a, b) => a.count - b.count)[0];
    if (busiest && slowest && busiest.dow !== slowest.dow) {
      out.push({ severity: 'low', title: `${dayName(busiest.dow)}s are your busiest day`, detail: `${busiest.count} orders · ${formatPrice(busiest.revenue)}. ${dayName(slowest.dow)}s are slowest (${slowest.count}) — plan staffing accordingly.` });
    }
  }
  const topEarner = (reco?.topRevenue || []).filter(r => r.revenue > 0)[0];
  if (topEarner) {
    out.push({ severity: 'low', title: `${topEarner.name} is ${ASSISTANT_NAME}'s top earner`, detail: `${formatPrice(topEarner.revenue)} attributed from recommendations. Keep it stocked and well-paired.` });
  }
  return out;
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dayName(d: number) { return DAYS[d] || ''; }
