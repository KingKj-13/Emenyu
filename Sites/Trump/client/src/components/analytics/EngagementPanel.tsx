import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye, Users, Clock, Languages, PlayCircle, Beef, LayoutGrid, TrendingDown, RefreshCw,
} from 'lucide-react';
import { api } from '../../services/api';
import { localeDefinition } from '../../i18n/locales';
import styles from './EngagementPanel.module.css';

/**
 * What guests actually looked at.
 *
 * This is the report that replaces the old order-driven analytics for the QR
 * menu: with no cart there is no conversion to measure, so the question becomes
 * attention — which dishes get opened, which cuts get explored, which videos
 * get watched to the end, and which languages the room is really reading in.
 *
 * Every number is computed from stored events. Nothing here is a placeholder,
 * and a restaurant with no traffic yet sees honest zeroes.
 */

interface Summary {
  range: { from: string; to: string };
  totals: {
    events: number;
    sessions: number;
    byType: Record<string, number>;
    avgDwellMs: number;
    dwellSamples: number;
  };
  topItems: Array<{ menuItemId: number; name: string; views: number }>;
  topCategories: Array<{ name: string; views: number }>;
  topCuts: Array<{ slug: string; name: string; views: number }>;
  languages: Array<{ locale: string; views: number; share: number }>;
  video: Array<{
    menuItemId: number; name: string; plays: number; completes: number; completionRate: number;
    // Sessions that watched this dish's video and later placed an order
    // containing it — correlated by the guest's own browser session, so this
    // is only ever non-zero for a tenant whose guests order from their own
    // device (the Demo tenant). Trump's waiter-submitted orders carry no
    // guest session to correlate against, by design — see server comment.
    conversions: number; conversionRate: number;
  }>;
}

interface Timeline {
  byHour: Array<{ hour: number; views: number }>;
  byDay: Array<{ date: string; views: number }>;
}

const RANGES = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
] as const;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

function seconds(ms: number): string {
  if (!ms) return '—';
  return ms >= 60_000
    ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
    : `${(ms / 1000).toFixed(1)}s`;
}

export function EngagementPanel() {
  const [days, setDays] = useState<string>('30');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [least, setLeast] = useState<Array<{ menuItemId: number; name: string; views: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = { from: isoDaysAgo(Number(days)) };
    try {
      const [s, t, l] = await Promise.all([
        api.getEngagementSummary(params),
        api.getEngagementTimeline(params),
        api.getEngagementLeastViewed(params),
      ]);
      setSummary(s as Summary);
      setTimeline(t as Timeline);
      setLeast((l as { items: typeof least }).items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load engagement data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const peakHour = useMemo(() => {
    if (!timeline?.byHour?.length) return null;
    return timeline.byHour.reduce((a, b) => (b.views > a.views ? b : a));
  }, [timeline]);

  const maxHour = useMemo(
    () => Math.max(1, ...(timeline?.byHour ?? []).map(h => h.views)),
    [timeline]
  );

  if (loading && !summary) {
    return <div className={styles.state}>Loading engagement…</div>;
  }
  if (error) {
    return (
      <div className={styles.state}>
        <p>{error}</p>
        <button className={styles.refresh} onClick={() => void load()}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }
  if (!summary) return <div className={styles.state}>No engagement data yet.</div>;

  const t = summary.totals;
  const noData = t.events === 0;

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.ranges}>
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`${styles.range} ${days === r.key ? styles.rangeOn : ''}`}
              onClick={() => setDays(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button className={styles.refresh} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? styles.spin : ''} /> Refresh
        </button>
      </div>

      {noData ? (
        <div className={styles.empty}>
          <p>No guest activity recorded in this period yet.</p>
          <p className={styles.emptyHint}>
            Views are captured anonymously as guests browse the QR menu. Figures appear
            here as soon as the first table scans in.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tiles}>
            <Tile icon={<Eye size={16} />} label="Menu views" value={t.byType.MENU_VIEW ?? 0} />
            <Tile icon={<Users size={16} />} label="Guest sessions" value={t.sessions} />
            <Tile icon={<LayoutGrid size={16} />} label="Dish views" value={t.byType.ITEM_VIEW ?? 0} />
            <Tile icon={<Beef size={16} />} label="Cut explorations" value={t.byType.CUT_VIEW ?? 0} />
            <Tile
              icon={<Clock size={16} />}
              label="Avg. time on a dish"
              value={seconds(t.avgDwellMs)}
              note={`${t.dwellSamples} measured`}
            />
            <Tile
              icon={<PlayCircle size={16} />}
              label="Videos played"
              value={t.byType.VIDEO_PLAY ?? 0}
              note={`${t.byType.VIDEO_COMPLETE ?? 0} watched through`}
            />
          </div>

          <div className={styles.grid}>
            <Card title="Most viewed dishes" icon={<Eye size={14} />}>
              <RankList rows={summary.topItems.map(i => ({ label: i.name, value: i.views }))} />
            </Card>

            <Card title="Cuts explored" icon={<Beef size={14} />}>
              <RankList rows={summary.topCuts.map(c => ({ label: c.name || c.slug, value: c.views }))} />
            </Card>

            <Card title="Languages in use" icon={<Languages size={14} />}>
              {summary.languages.length === 0 ? (
                <p className={styles.none}>No language selections recorded.</p>
              ) : (
                <ul className={styles.bars}>
                  {summary.languages.map(l => {
                    const def = localeDefinition(l.locale);
                    return (
                      <li key={l.locale}>
                        <span className={styles.barLabel}>
                          {def.english}
                          <i lang={def.code} dir={def.dir} className={styles.native}>{def.native}</i>
                        </span>
                        <span className={styles.barTrack}>
                          <span className={styles.barFill} style={{ width: `${l.share}%` }} />
                        </span>
                        <span className={styles.barValue}>{l.share}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Video engagement" icon={<PlayCircle size={14} />}>
              {summary.video.length === 0 ? (
                <p className={styles.none}>No videos played in this period.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Dish</th><th>Plays</th><th>Finished</th><th>Rate</th><th>Ordered after</th></tr>
                  </thead>
                  <tbody>
                    {summary.video.map(v => (
                      <tr key={`${v.menuItemId}-${v.name}`}>
                        <td>{v.name || '—'}</td>
                        <td>{v.plays}</td>
                        <td>{v.completes}</td>
                        <td className={styles.rate}>{v.completionRate}%</td>
                        <td className={styles.rate}>
                          {v.conversions > 0 ? `${v.conversions} (${v.conversionRate}%)` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="When guests browse" icon={<Clock size={14} />}>
              <p className={styles.cardNote}>
                {peakHour && peakHour.views > 0
                  ? `Busiest at ${String(peakHour.hour).padStart(2, '0')}:00`
                  : 'Not enough data yet'}
              </p>
              <div className={styles.hours}>
                {(timeline?.byHour ?? []).map(h => (
                  <span
                    key={h.hour}
                    className={styles.hourBar}
                    style={{ height: `${Math.max(2, (h.views / maxHour) * 100)}%` }}
                    title={`${String(h.hour).padStart(2, '0')}:00 — ${h.views} views`}
                  />
                ))}
              </div>
              <div className={styles.hourAxis}><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
            </Card>

            <Card title="Categories" icon={<LayoutGrid size={14} />}>
              <RankList rows={summary.topCategories.map(c => ({ label: c.name, value: c.views }))} />
            </Card>

            <Card title="Least viewed dishes" icon={<TrendingDown size={14} />} wide>
              <p className={styles.cardNote}>
                Counted across the whole menu, so dishes nobody opened still appear.
              </p>
              <RankList
                rows={least.slice(0, 12).map(i => ({ label: i.name, value: i.views }))}
                muted
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ icon, label, value, note }: {
  icon: React.ReactNode; label: string; value: number | string; note?: string;
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileIcon}>{icon}</span>
      <span className={styles.tileValue}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {note && <span className={styles.tileNote}>{note}</span>}
    </div>
  );
}

function Card({ title, icon, children, wide }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <section className={`${styles.card} ${wide ? styles.cardWide : ''}`}>
      <h3 className={styles.cardTitle}>{icon} {title}</h3>
      {children}
    </section>
  );
}

function RankList({ rows, muted }: { rows: Array<{ label: string; value: number }>; muted?: boolean }) {
  if (rows.length === 0) return <p className={styles.none}>Nothing recorded yet.</p>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ol className={styles.rank}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <span className={styles.rankLabel} title={r.label}>{r.label}</span>
          <span className={styles.rankTrack}>
            <span
              className={`${styles.rankFill} ${muted ? styles.rankFillMuted : ''}`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className={styles.rankValue}>{r.value}</span>
        </li>
      ))}
    </ol>
  );
}
