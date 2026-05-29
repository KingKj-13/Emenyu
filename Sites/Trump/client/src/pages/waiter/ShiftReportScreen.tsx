import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { money, pct } from '../../lib/waiterFormat';
import type { ShiftReport } from '../../types/waiter';

export function ShiftReportScreen() {
  const { shift } = useWaiter();
  const [report, setReport] = useState<ShiftReport | null>(null);

  useEffect(() => {
    api.getWaiterShiftReport({ waiter: shift.name, period: 'today' }).then(setReport).catch(() => setReport(null));
  }, [shift.name]);

  if (!report) return <div className="w-spinner" />;

  return (
    <div>
      <div className="w-hero" style={{ marginTop: 4 }}>
        <p className="w-eyebrow">Shift revenue</p>
        <div className="w-hero-num">{money(report.salesDriven)}</div>
        {report.rank && <p className="w-delta">#{report.rank} on the floor tonight</p>}
      </div>

      <div className="w-stat-grid">
        <div className="w-stat gold"><span className="w-eyebrow-dim">Tips earned</span><div className="w-stat-num">{money(report.tips)}</div></div>
        <div className="w-stat"><span className="w-eyebrow-dim">Avg check</span><div className="w-stat-num">{money(report.avgCheck)}</div></div>
        <div className="w-stat accent"><span className="w-eyebrow-dim">Upsell rate</span><div className="w-stat-num">{pct(report.upsellRate)}</div></div>
        <div className="w-stat"><span className="w-eyebrow-dim">Tables served</span><div className="w-stat-num">{report.tablesServed}</div></div>
      </div>

      {(report.bestUpsell || report.topTable) && (
        <div className="w-card" style={{ marginTop: 14 }}>
          {report.bestUpsell && <p style={{ marginBottom: 8 }}><span className="w-eyebrow-dim">Best upsell · </span>{report.bestUpsell.item} (+{money(report.bestUpsell.value)})</p>}
          {report.topTable && <p><span className="w-eyebrow-dim">Top table · </span>{report.topTable.tableId.replace('table', 'Table ')} — {money(report.topTable.revenue)}</p>}
        </div>
      )}

      <div className="w-section-label"><span className="w-eyebrow">Coaching for next shift</span><span className="line" /></div>
      {(report.coaching || []).length === 0 && <p className="w-empty">Strong shift — keep doing what you're doing.</p>}
      {(report.coaching || []).map((tip, i) => (
        <div key={i} className="w-sable" style={{ marginTop: i === 0 ? 0 : 12 }}>
          <p className="w-sable-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Sparkles size={17} color="var(--w-gold)" style={{ flexShrink: 0, marginTop: 2 }} /> {tip}
          </p>
        </div>
      ))}
    </div>
  );
}
