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
import styles from './AnalyticsPanels.module.css';

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
      <div className={styles.head}>
        <h3 className={styles.title}>Customer Journey</h3>
        <select
          className={styles.select}
          value={selected}
          onChange={e => setSelected(e.target.value)}
        >
          {tableOptions.length === 0 && <option value="">No tables yet</option>}
          {tableOptions.map(t => <option key={t} value={t}>{t.replace(/^table/i, 'Table ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading journey…</div>
      ) : !journey || !journey.found ? (
        <div className={styles.empty}>No order history for this table yet.</div>
      ) : (
        <>
          <div className={styles.metaRow}>
            <span><strong>{journey.status === 'active' ? 'Currently dining' : 'Completed visit'}</strong></span>
            {journey.waiterName && <span className={styles.metaMuted}>Served by {journey.waiterName}</span>}
            {journey.total != null && <span className={styles.metaMuted}>{formatPrice(journey.total)}</span>}
            {journey.rating != null && <span className={styles.metaMuted}>{journey.rating}★ rated</span>}
          </div>

          <div className={styles.timeline}>
            {(journey.steps || []).map((step, i) => (
              <div key={step.key} className={styles.timelineStep}>
                <div className={styles.timelineRail}>
                  <div className={`${styles.timelineDot} ${step.done ? styles.timelineDotDone : ''}`}>
                    {step.done ? <Check size={14} /> : <Circle size={8} fill="currentColor" />}
                  </div>
                  {i < (journey.steps?.length || 0) - 1 && (
                    <div className={`${styles.timelineLine} ${step.done ? styles.timelineLineDone : ''}`} />
                  )}
                </div>
                <div className={styles.timelineBody}>
                  <div className={`${styles.timelineLabel} ${step.done ? styles.timelineLabelDone : ''}`}>{step.label}</div>
                  {step.items && step.items.length > 0 && (
                    <div className={styles.timelineDetail}>{step.items.join(', ')}</div>
                  )}
                  {step.detail && <div className={styles.timelineDetail}>{step.detail}</div>}
                  {!step.done && step.key === 'recommendation' && (
                    <div className={styles.timelineNote}>
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
