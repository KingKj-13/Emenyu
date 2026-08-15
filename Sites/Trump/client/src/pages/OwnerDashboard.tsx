// Owner / BI dashboard — a decluttered, mobile-first view for the owner role.
// It REUSES the existing analytics endpoints (summary / items / tables / hours /
// trend / day-of-week / engagement) — no analytics are re-implemented here;
// this file only fetches and frames data the server already computes.
// Operational depth still lives in /Admin.
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, LogOut, SlidersHorizontal, ArrowUpRight, Upload } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { useHomeBackGuard } from '../hooks/useHomeBackGuard';
import { useSocketEvent } from '../hooks/useSocket';
import { api } from '../services/api';
import { formatPrice } from '../lib/menuUtils';
import { sastTodayStartIso } from '../lib/businessDay';
import { BRAND_NAME } from '../constants/api';
import styles from './OwnerDashboard.module.css';

// ── response shapes (typing the existing endpoints; not re-deriving them) ──
interface Summary { revenue: number; orderCount: number; avgOrderValue: number; topTable: string | null; topTableRevenue: number; covers?: number; avgPerCover?: number }
interface Item { name: string; quantity: number; revenue: number; categoryType?: string }
interface Hour { hour: number; count: number }
interface Dow { dow: number; label: string; count: number; revenue: number }
interface TrendPoint { date: string; revenue: number; orders: number }
interface TableRow { tableId: string; revenue: number; orderCount: number }
interface Pairing { a: string; b: string; count: number; revenue: number }
interface EngagementItem { menuItemId: number; name: string; views: number }
interface EngagementVideo {
  menuItemId: number; name: string; plays: number; avgWatchSec: number;
  conversions: number; conversionRate: number;
}
interface MostWatchedVideo { menuItemId: number; name: string; plays: number; avgWatchSec: number; totalWatchSec: number }
interface Engagement {
  totals: { byType: Record<string, number> };
  topItems: EngagementItem[];
  video: EngagementVideo[];
  mostWatchedVideos: MostWatchedVideo[];
}

function watchTime(sec: number): string {
  if (!sec) return '—';
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

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
    ? sastTodayStartIso()
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
  useHomeBackGuard();
  const { user, logout } = useAuth();
  const [range, setRange] = useState<RangeKey>('today');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topItems, setTopItems] = useState<Item[]>([]);
  const [bottomItems, setBottomItems] = useState<Item[]>([]);
  const [hours, setHours] = useState<Hour[]>([]);
  const [dow, setDow] = useState<Dow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [drinkItems, setDrinkItems] = useState<Item[]>([]);
  const [dessertItems, setDessertItems] = useState<Item[]>([]);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (r: RangeKey) => {
    setLoading(true);
    const { from, to, bucket } = rangeParams(r);
    const p = { from, to };
    const [s, ti, bi, h, dw, tr, tb, di, de, pr, eg] = await Promise.all([
      api.getAnalyticsSummary(p).catch(() => null),
      // "Top/Bottom dishes" must never include drinks — excludeCategory pulls
      // a wider pool server-side and filters before slicing to the display limit.
      api.getAnalyticsItems({ ...p, order: 'desc', excludeCategory: 'WINE,DRINK' }).catch(() => []),
      api.getAnalyticsItems({ ...p, order: 'asc', excludeCategory: 'WINE,DRINK' }).catch(() => []),
      api.getAnalyticsHours(p).catch(() => []),
      api.getAnalyticsDayOfWeek(p).catch(() => []),
      api.getAnalyticsTrend({ ...p, bucket }).catch(() => ({ bucket, points: [] })),
      api.getAnalyticsTables(p).catch(() => []),
      // "Top drinks" subtitle promises wine + cocktails + beer + soft drinks —
      // WINE and DRINK are separate categoryType buckets, so both must be requested.
      api.getAnalyticsItems({ ...p, order: 'desc', category: 'WINE,DRINK', limit: 5 }).catch(() => []),
      api.getAnalyticsItems({ ...p, order: 'desc', category: 'DESSERT', limit: 5 }).catch(() => []),
      api.getAnalyticsPairings(p).catch(() => []),
      api.getEngagementSummary(p).catch(() => null),
    ]);
    setSummary(s as Summary | null);
    setTopItems(ti as Item[]);
    setBottomItems(bi as Item[]);
    setHours(h as Hour[]);
    setDow(dw as Dow[]);
    setTrend((tr as { points: TrendPoint[] })?.points || []);
    setTables(tb as TableRow[]);
    setDrinkItems(di as Item[]);
    setDessertItems(de as Item[]);
    setPairings(pr as Pairing[]);
    setEngagement(eg as Engagement | null);
    setLoading(false);
  }, []);

  async function handleImportOrdersCsv(file: File) {
    setImportingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.importOrdersCsv(formData);
      const errorNote = result.errors.length ? `\n\n${result.errors.slice(0, 5).join('\n')}` : '';
      alert(
        `Imported ${result.ordersCreated} order${result.ordersCreated !== 1 ? 's' : ''} `
        + `(${result.itemsImported} item${result.itemsImported !== 1 ? 's' : ''}).`
        + (result.skippedRows ? ` ${result.skippedRows} row(s) skipped.` : '')
        + errorNote
      );
      await load(range);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Import failed');
    }
    setImportingCsv(false);
  }

  useEffect(() => { load(range); }, [range, load]);

  // Every KPI/panel here previously only refetched on a range change or a
  // manual reselect of the same button — an owner watching the dashboard
  // during service never saw it update as orders came in. Debounced (one
  // timer, reset on each event) so a burst of orders/status changes in quick
  // succession triggers one reload, not one per event.
  const reloadTimer = useRef<number | undefined>(undefined);
  const reloadSoon = useCallback(() => {
    window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => load(range), 1500);
  }, [range, load]);
  useEffect(() => () => window.clearTimeout(reloadTimer.current), []);
  useSocketEvent('orderPlaced', reloadSoon);
  useSocketEvent('kitchenStatusUpdate', reloadSoon);

  const covers = summary?.covers || 0;
  const avgPerCover = covers > 0 ? (summary!.revenue / covers) : 0;

  // Video watch -> order conversion, aggregated across every dish's video.
  // Correlated by the guest's own browser session (see server comment on
  // videoConversionsBySession) -- only ever non-zero for a tenant whose
  // guests order from their own device. Trump's waiter-submitted orders
  // carry no guest session, so this reads an honest zero here by design,
  // not a broken feature.
  const engagementVideos = engagement?.video || [];
  const totalVideoPlays = engagementVideos.reduce((s, v) => s + v.plays, 0);
  const totalConversions = engagementVideos.reduce((s, v) => s + v.conversions, 0);
  const conversionRate = totalVideoPlays > 0 ? Math.round((totalConversions / totalVideoPlays) * 1000) / 10 : 0;

  return (
    <AppShell requireRole="owner" hideHeader>
      <div className={styles.page}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandTitle}>{BRAND_NAME}</span>
            <span className={styles.brandSub}>OWNER DASHBOARD</span>
          </div>
          <div className={styles.topActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleImportOrdersCsv(file);
              }}
            />
            <button className={styles.adminLink} onClick={() => fileInputRef.current?.click()} disabled={importingCsv}>
              <Upload size={14} /> {importingCsv ? 'Importing…' : 'Import orders'}
            </button>
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
            {/* KPI strip */}
            <section className={styles.kpiGrid}>
              <Kpi value={formatPrice(summary?.revenue || 0)} label="Revenue" />
              <Kpi value={String(summary?.orderCount || 0)} label="Orders" />
              <Kpi value={formatPrice(summary?.avgOrderValue || 0)} label="Avg order" />
              <Kpi value={covers > 0 ? String(covers) : '—'} label="Covers" hint={covers > 0 ? undefined : 'captured at seating'} />
              <Kpi value={avgPerCover > 0 ? formatPrice(avgPerCover) : '—'} label="Avg / cover" />
              <Kpi value={summary?.topTable ? summary.topTable.replace(/^table/i, 'Table ') : '—'} label="Top table" sub={summary?.topTableRevenue ? formatPrice(summary.topTableRevenue) : ''} />
            </section>

            {/* Guest interest — what guests actually looked at, as distinct from what
                they ordered (that's "Top dishes" further down, sourced from real
                sales). Everything here comes from anonymous view events. */}
            <div className={styles.twoUp}>
              <Panel title="Most viewed dishes" subtitle="Opened to read — not necessarily ordered">
                <ViewList rows={engagement?.topItems || []} empty="No dish views in this period." />
              </Panel>
              <Panel title="Most viewed videos" subtitle="By play count">
                <ViewList
                  rows={(engagement?.video || []).map(v => ({ menuItemId: v.menuItemId, name: v.name, views: v.plays }))}
                  empty="No videos played in this period."
                />
              </Panel>
            </div>

            <div className={styles.twoUp}>
              <Panel title="Most-watched videos" subtitle="By total time watched, not just plays">
                {engagement?.mostWatchedVideos.length ? (
                  <div className={styles.dishList}>
                    {engagement.mostWatchedVideos.slice(0, 7).map((v, i) => (
                      <div key={`${v.menuItemId}-${v.name}`} className={styles.dishRow}>
                        <span className={styles.dishRank}>#{i + 1}</span>
                        <span className={styles.dishName}>{v.name || '—'}</span>
                        <span className={styles.dishQty}>{v.plays} play{v.plays !== 1 ? 's' : ''}</span>
                        <span className={styles.dishRev}>{watchTime(v.avgWatchSec)}/play</span>
                      </div>
                    ))}
                  </div>
                ) : <Empty msg="No videos played in this period." />}
              </Panel>
              <Panel title="Conversion" subtitle="Video plays that went on to be ordered from the guest's own session">
                <div className={styles.kpiGridInline}>
                  <Kpi value={String(totalConversions)} label="Watched → ordered" sub={totalVideoPlays > 0 ? `of ${totalVideoPlays} plays` : undefined} />
                  <Kpi value={`${conversionRate}%`} label="Conversion rate" />
                </div>
                {totalVideoPlays > 0 && totalConversions === 0 && (
                  <p className={styles.panelNote}>
                    Trump's guests order through their waiter, not a cart on their own device — a video view has no
                    guest session to link to an order, so this reads zero by design rather than a broken tracker.
                  </p>
                )}
              </Panel>
            </div>

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
                          <div className={`${styles.bar} ${styles.barGold}`} style={{ height: `${(h.count / max) * 100}%` }} />
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
              <Panel title="Top dishes" subtitle="By quantity sold — see revenue alongside">
                <DishList rows={topItems} empty="No sales yet." />
              </Panel>
              <Panel title="Bottom dishes" subtitle="Least ordered (of items that sold)">
                <DishList rows={bottomItems} empty="No sales yet." />
              </Panel>
            </div>

            {/* Top drinks & desserts */}
            <div className={styles.twoUp}>
              <Panel title="Top drinks" subtitle="Wine, cocktails, beer & soft drinks">
                <DishList rows={drinkItems} empty="No drinks sold yet." />
              </Panel>
              <Panel title="Top desserts">
                <DishList rows={dessertItems} empty="No desserts sold yet." />
              </Panel>
            </div>

            {/* Highest-spending tables (full ranking) */}
            <Panel title="Highest-spending tables" subtitle="Completed orders, this period">
              {tables.length > 0 ? (
                <div className={styles.dishList}>
                  {tables.slice(0, 7).map((t, i) => (
                    <div key={t.tableId} className={styles.dishRow}>
                      <span className={styles.dishRank}>#{i + 1}</span>
                      <span className={styles.dishName}>{t.tableId.replace(/^table/i, 'Table ')}</span>
                      <span className={styles.dishQty}>{t.orderCount} order{t.orderCount !== 1 ? 's' : ''}</span>
                      <span className={styles.dishRev}>{formatPrice(t.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty msg="No completed orders yet." />}
            </Panel>

            {/* Popular pairings */}
            <Panel title="Popular pairings" subtitle="Items most often ordered on the same bill">
              {pairings.length > 0 ? (
                <div className={styles.dishList}>
                  {pairings.slice(0, 6).map(p => (
                    <div key={`${p.a}|${p.b}`} className={styles.dishRow}>
                      <span className={styles.dishRank}>{p.count}×</span>
                      <span className={styles.dishName}>{p.a} + {p.b}</span>
                      <span className={styles.dishRev}>{formatPrice(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty msg="No repeated pairings yet." />}
            </Panel>

            <Link to="/Admin" className={styles.fullLink}>Open full analytics & operations in the admin console <ArrowUpRight size={14} /></Link>
          </>
        )}
      </div>
    </AppShell>
  );
}

// ── small presentational helpers (presentation only — no aggregation) ──
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

function ViewList({ rows, empty }: { rows: EngagementItem[]; empty: string }) {
  if (!rows || rows.length === 0) return <Empty msg={empty} />;
  return (
    <div className={styles.dishList}>
      {rows.slice(0, 7).map((it, i) => (
        <div key={`${it.menuItemId}-${it.name}`} className={styles.dishRow}>
          <span className={styles.dishRank}>#{i + 1}</span>
          <span className={styles.dishName}>{it.name || '—'}</span>
          <span className={styles.dishQty} />
          <span className={styles.dishRev}>{it.views} view{it.views !== 1 ? 's' : ''}</span>
        </div>
      ))}
    </div>
  );
}

