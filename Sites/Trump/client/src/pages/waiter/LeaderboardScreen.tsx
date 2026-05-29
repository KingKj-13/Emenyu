import { useEffect, useState } from 'react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
import type { LeaderboardPeriod, LeaderboardResponse } from '../../types/waiter';

const BADGE_ICON: Record<string, string> = {
  top_seller: '🏆', wine_expert: '🍷', dessert_champion: '🍰',
  upsell_master: '📈', big_spender_tables: '💎', busy_bee: '⚡'
};

export function LeaderboardScreen() {
  const { shift } = useWaiter();
  const [period, setPeriod] = useState<LeaderboardPeriod>('today');
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    api.getWaiterLeaderboard({ waiter: shift.name, period }).then(setData).catch(() => setData(null));
  }, [period, shift.name]);

  return (
    <div>
      <div className="w-chips" style={{ marginTop: 4 }}>
        {(['today', 'week', 'month'] as LeaderboardPeriod[]).map(p => (
          <button key={p} className={`w-chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="w-section-label"><span className="w-eyebrow">Leaderboard</span><span className="line" /></div>
      {(data?.leaderboard || []).map(row => (
        <div key={row.waiterName} className={`w-rank ${row.waiterName === shift.name ? 'me' : ''}`}>
          <span className="pos">{row.rank}</span>
          <span className="who">{row.waiterName}</span>
          <span className="amt">{money(row.salesDriven)}</span>
        </div>
      ))}
      {(!data || data.leaderboard.length === 0) && <p className="w-empty">No sales recorded yet.</p>}

      <div className="w-section-label"><span className="w-eyebrow">Achievements</span><span className="line" /></div>
      <div className="w-badges">
        {(data?.achievements || []).map(a => (
          <div key={a.key} className={`w-badge ${a.earned ? 'earned' : 'locked'}`}>
            <div className="bi">{BADGE_ICON[a.key] || '★'}</div>
            <div className="bl">{a.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
