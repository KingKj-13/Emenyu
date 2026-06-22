import { useEffect, useState } from 'react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { money, moneyExact, pct } from '../../lib/waiterFormat';
import { SHIFT_START } from '../../constants/waiter';
import { LeaderboardScreen } from './LeaderboardScreen';
import { ShiftReportScreen } from './ShiftReportScreen';
import type { Performance } from '../../types/waiter';

type SubView = 'today' | 'leaderboard' | 'report';

export function TodayScreen() {
  const { shift } = useWaiter();
  const [view, setView] = useState<SubView>('today');
  const [perf, setPerf] = useState<Performance | null>(null);

  useEffect(() => {
    api.getWaiterPerformance({ waiter: shift.name, period: 'today' }).then(setPerf).catch(() => setPerf(null));
  }, [shift.name]);

  return (
    <div className="w-screen">
      <div className="w-chips" style={{ marginBottom: 8 }}>
        <button className={`w-chip ${view === 'today' ? 'active' : ''}`} onClick={() => setView('today')}>Tonight</button>
        <button className={`w-chip ${view === 'leaderboard' ? 'active' : ''}`} onClick={() => setView('leaderboard')}>Leaderboard</button>
        <button className={`w-chip ${view === 'report' ? 'active' : ''}`} onClick={() => setView('report')}>Shift report</button>
      </div>

      {view === 'leaderboard' && <LeaderboardScreen />}
      {view === 'report' && <ShiftReportScreen />}
      {view === 'today' && (
        <>
          <p className="w-eyebrow" style={{ marginTop: 8 }}>Your shift · Since {SHIFT_START}</p>
          <h1 className="w-display" style={{ fontSize: 40, marginTop: 6 }}>Tonight, so far</h1>

          <div className="w-hero" style={{ marginTop: 18 }}>
            <p className="w-eyebrow">Sales you've driven</p>
            <div className="w-hero-num">{moneyExact(perf?.salesDriven || 0)}</div>
            {perf?.vsAverage != null && (
              <p className={`w-delta ${perf.vsAverage < 0 ? 'down' : ''}`}>
                {perf.vsAverage >= 0 ? '▲' : '▼'} {perf.vsAverage >= 0 ? '+' : ''}{perf.vsAverage}% vs. your average
              </p>
            )}
          </div>

          <div className="w-stat-grid">
            <div className="w-stat"><span className="w-eyebrow-dim">Tables served</span><div className="w-stat-num">{perf?.tablesServed ?? 0}</div></div>
            <div className="w-stat"><span className="w-eyebrow-dim">Avg check</span><div className="w-stat-num">{money(perf?.avgCheck || 0)}</div></div>
            <div className="w-stat accent"><span className="w-eyebrow-dim">Upsell rate</span><div className="w-stat-num">{pct(perf?.upsellRate || 0)}</div></div>
            <div className="w-stat gold"><span className="w-eyebrow-dim">Tips</span><div className="w-stat-num">{money(perf?.tips || 0)}</div></div>
          </div>

          <div className="w-section-label"><span className="w-eyebrow">Sales by course</span><span className="line" /></div>
          {(perf?.salesByCourse || []).map(c => (
            <div key={c.label} className="w-bar-row">
              <div className="w-bar-head"><span>{c.label}</span><b>{c.pct}%</b></div>
              <div className="w-bar-track"><div className="w-bar-fill" style={{ width: `${c.pct}%` }} /></div>
            </div>
          ))}
          {(!perf || perf.salesByCourse.length === 0) && <p className="w-empty">No sales recorded yet tonight.</p>}
        </>
      )}
    </div>
  );
}
