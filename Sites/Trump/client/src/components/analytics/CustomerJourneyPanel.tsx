// Phase 6 — Customer Journey visualization. Built fresh from Order/OrderItem for
// a single table (categoryClassifier is the shared, non-engine classifier every
// other surface uses). Deliberately does NOT import mealStateService or
// recommendationMemory — those are Recommendation Engine V2 internals.
import { useState, useEffect, useCallback } from 'react';
import { Check, Circle } from 'lucide-react';
import { api } from '../../services/api';
import { formatPrice } from '../../lib/menuUtils';
import { ASSISTANT_NAME } from '../../constants/config';
import type { FloorState } from '../../types/waiter';

interface JourneyStep { key: string; label: string; done: boolean; items?: string[]; detail?: string }
interface Journey { tableId: string; found: boolean; status?: string; timestamp?: string; total?: number; waiterName?: string; rating?: number | null; steps?: JourneyStep[] }

export function CustomerJourneyPanel() {
  const [tableOptions, setTableOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [floor, tables] = await Promise.all([
        api.getFloor().catch(() => null),
        api.getAnalyticsTables({}).catch(() => []),
      ]);
      const active = ((floor as FloorState | null)?.tables || []).filter(t => t.status !== 'empty').map(t => t.tableId);
      const historical = (tables as { tableId: string }[]).map(t => t.tableId);
      const merged = [...new Set([...active, ...historical])];
      setTableOptions(merged);
      if (merged.length > 0) setSelected(merged[0]);
      else setLoading(false);
    })();
  }, []);

  const load = useCallback(async (tableId: string) => {
    if (!tableId) return;
    setLoading(true);
    const data = await api.getCustomerJourney(tableId).catch(() => null);
    setJourney(data as Journey | null);
    setLoading(false);
  }, []);

  useEffect(() => { if (selected) load(selected); }, [selected, load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Customer Journey</h3>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e7ddc8', fontSize: 13, background: '#fff' }}
        >
          {tableOptions.length === 0 && <option value="">No tables yet</option>}
          {tableOptions.map(t => <option key={t} value={t}>{t.replace(/^table/i, 'Table ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 16, opacity: .6 }}>Loading journey…</div>
      ) : !journey || !journey.found ? (
        <div style={{ padding: 16, opacity: .5, fontSize: 13 }}>No order history for this table yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18, fontSize: 13 }}>
            <span><strong>{journey.status === 'active' ? 'Currently dining' : 'Completed visit'}</strong></span>
            {journey.waiterName && <span style={{ opacity: .7 }}>Served by {journey.waiterName}</span>}
            {journey.total != null && <span style={{ opacity: .7 }}>{formatPrice(journey.total)}</span>}
            {journey.rating != null && <span style={{ opacity: .7 }}>{journey.rating}★ rated</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(journey.steps || []).map((step, i) => (
              <div key={step.key} style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                    background: step.done ? '#c6a24b' : '#f0e9d8', color: step.done ? '#fff' : '#9b8a66',
                  }}>
                    {step.done ? <Check size={14} /> : <Circle size={8} fill="currentColor" />}
                  </div>
                  {i < (journey.steps?.length || 0) - 1 && (
                    <div style={{ width: 2, flex: 1, minHeight: 18, background: step.done ? '#c6a24b' : '#f0e9d8' }} />
                  )}
                </div>
                <div style={{ paddingBottom: 18 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: step.done ? '#1a1206' : '#9b8a66' }}>{step.label}</div>
                  {step.items && step.items.length > 0 && (
                    <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>{step.items.join(', ')}</div>
                  )}
                  {step.detail && <div style={{ fontSize: 12, opacity: .7, marginTop: 2 }}>{step.detail}</div>}
                  {!step.done && step.key === 'recommendation' && (
                    <div style={{ fontSize: 11, opacity: .5, fontStyle: 'italic', marginTop: 2 }}>
                      No {ASSISTANT_NAME} interaction tracked for this specific visit.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
