import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Mic, Wine } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
import { RecommendationCard, type RecommendationItem } from '../../components/reco/RecommendationCard';
import { SPEECH_TONES } from '../../constants/waiter';
import type { CoachResponse, SommelierResponse, SpeechTone } from '../../types/waiter';

export function AICoachScreen() {
  const { selectedTableId, addToOrder, openOverlay, setTab, shift, showToast } = useWaiter();
  const [tone, setTone] = useState<SpeechTone>('professional');
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCoach = useCallback((t: SpeechTone) => {
    if (!selectedTableId) { setCoach(null); return; }
    setLoading(true);
    api.coach({ tableId: selectedTableId, tone: t })
      .then(setCoach)
      .catch(() => setCoach(null))
      .finally(() => setLoading(false));
  }, [selectedTableId]);

  useEffect(() => { loadCoach(tone); }, [loadCoach, tone]);

  // ── Sommelier ──
  const [dish, setDish] = useState('');
  const [somm, setSomm] = useState<SommelierResponse | null>(null);
  const [sommLoading, setSommLoading] = useState(false);
  const askSommelier = () => {
    setSommLoading(true);
    api.sommelier({ dish: dish || undefined, tone })
      .then(setSomm)
      .catch(() => setSomm(null))
      .finally(() => setSommLoading(false));
  };

  return (
    <div className="w-screen">
      <p className="w-eyebrow">AI Coach</p>
      <h1 className="w-display" style={{ fontSize: 34, marginTop: 4 }}>Your hospitality intelligence</h1>

      {/* Voice */}
      <div className="w-card" style={{ marginTop: 18, textAlign: 'center' }}>
        <button className="w-mic" onClick={() => openOverlay('voice')} aria-label="Ask by voice"><Mic size={28} /></button>
        <p style={{ marginTop: 12, color: 'var(--w-text2)' }}>Ask aloud — “Which wine complements the King &amp; Queen Platter?”</p>
      </div>

      {/* Best recommendation / table coach */}
      <div className="w-section-label"><span className="w-eyebrow">Recommended for this table</span><span className="line" /></div>
      {!selectedTableId && (
        <div className="w-empty">
          <p>Select a table for a tailored recommendation.</p>
          <button className="w-btn-ghost" style={{ marginTop: 14 }} onClick={() => setTab('floor')}>Go to floor</button>
        </div>
      )}
      {selectedTableId && loading && <div className="w-spinner" />}
      {selectedTableId && !loading && coach && (
        <div className="w-sable">
          <div className="w-sable-head">
            <span className="w-sable-mark"><Sparkles size={17} /></span>
            <span className="w-sable-title">Sable · Table Pitch</span>
            <span className="w-sable-badge">AI</span>
          </div>
          {coach.suggestion ? (
            <>
              <div style={{ marginTop: 12 }}>
                <RecommendationCard
                  variant="waiter"
                  showReason
                  item={{ ...coach.suggestion, reason: coach.whyItWorks } as RecommendationItem}
                  note={coach.sayToTable}
                  addLabel={`Add to order · ${money(coach.suggestion.price)}`}
                  onAdd={() => { addToOrder(coach.suggestion!); api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: coach.suggestion!.name, accepted: true, source: 'coach', value: coach.suggestion!.price }).catch(() => {}); showToast(`Added ${coach.suggestion!.name}`); }}
                />
              </div>
              <div className="w-intel-row" style={{ marginTop: 12 }}>
                <div><div className="k">Expected revenue</div><div className="v" style={{ color: 'var(--w-green)' }}>+{money(coach.expectedRevenue)}</div></div>
                <div><div className="k">Success rate</div><div className="v">{coach.successRate}%</div></div>
              </div>
              <div className="w-tones" style={{ marginTop: 12 }}>
                {SPEECH_TONES.map(({ key, label }) => (
                  <button key={key} className={`w-tone ${tone === key ? 'active' : ''}`} onClick={() => setTone(key)}>{label}</button>
                ))}
              </div>
            </>
          ) : (
            <p className="w-sable-body" style={{ marginTop: 12 }}>{coach.whyItWorks || 'This table is well matched — suggest dessert as the pace slows.'}</p>
          )}
        </div>
      )}

      {/* Sommelier */}
      <div className="w-section-label"><span className="w-eyebrow">AI Sommelier</span><span className="line" /></div>
      <div className="w-card">
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ flex: 1, padding: '13px 15px', borderRadius: 12, background: '#000', border: '1px solid var(--w-border-gold)', color: 'var(--w-text)', outline: 'none' }}
            placeholder="Dish to pair (e.g. Tomahawk)…"
            value={dish}
            onChange={e => setDish(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && askSommelier()}
          />
          <button className="w-btn-ghost active" onClick={askSommelier}><Wine size={16} /></button>
        </div>
        {sommLoading && <div className="w-spinner" />}
        {somm && somm.wine && (
          <div style={{ marginTop: 14 }}>
            <RecommendationCard
              variant="waiter"
              showReason
              item={{ ...somm.wine, reason: somm.explanation } as RecommendationItem}
              addLabel={`Add · ${money(somm.wine.price)}`}
              onAdd={() => { addToOrder(somm.wine!); showToast(`Added ${somm.wine!.name}`); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
