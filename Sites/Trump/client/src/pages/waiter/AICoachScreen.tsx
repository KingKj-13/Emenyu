import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Mic, Wine, TrendingUp } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { money } from '../../lib/waiterFormat';
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
      <h1 className="w-display" style={{ fontSize: 34, marginTop: 4 }}>Your hospitality co-pilot</h1>

      {/* Voice */}
      <div className="w-card" style={{ marginTop: 18, textAlign: 'center' }}>
        <button className="w-mic" onClick={() => openOverlay('voice')} aria-label="Ask by voice"><Mic size={28} /></button>
        <p style={{ marginTop: 12, color: 'var(--w-text2)' }}>Ask anything — “What wine matches the Tomahawk?”</p>
      </div>

      {/* Best recommendation / table coach */}
      <div className="w-section-label"><span className="w-eyebrow">Best Recommendation</span><span className="line" /></div>
      {!selectedTableId && (
        <div className="w-empty">
          <p>Select a table to get a live table pitch.</p>
          <button className="w-btn-ghost" style={{ marginTop: 14 }} onClick={() => setTab('floor')}>Go to floor</button>
        </div>
      )}
      {selectedTableId && loading && <div className="w-spinner" />}
      {selectedTableId && !loading && coach && (
        <div className="w-sable">
          <div className="w-sable-head">
            <span className="w-sable-mark"><Sparkles size={17} /></span>
            <span className="w-sable-title">Suggested Opportunity</span>
            <span className="w-sable-badge">AI</span>
          </div>
          {coach.suggestion ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 12 }}>
                <span className="w-display" style={{ fontSize: 26 }}>{coach.suggestion.name}</span>
              </div>
              <div className="w-intel-row">
                <div><div className="k">Expected revenue</div><div className="v" style={{ color: 'var(--w-green)' }}>+{money(coach.expectedRevenue)}</div></div>
                <div><div className="k">Success rate</div><div className="v">{coach.successRate}%</div></div>
              </div>
              <div className="w-saytable">
                <div className="lbl">Say to the table</div>
                <p className="quote">“{coach.sayToTable}”</p>
              </div>
              <div className="w-tones">
                {SPEECH_TONES.map(({ key, label }) => (
                  <button key={key} className={`w-tone ${tone === key ? 'active' : ''}`} onClick={() => setTone(key)}>{label}</button>
                ))}
              </div>
              <p style={{ marginTop: 14, color: 'var(--w-text2)', fontSize: 14, display: 'flex', gap: 8 }}>
                <TrendingUp size={16} color="var(--w-gold)" /> {coach.whyItWorks}
              </p>
              <button className="w-btn-primary" style={{ marginTop: 16 }} onClick={() => { addToOrder(coach.suggestion!); api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: coach.suggestion!.name, accepted: true, source: 'coach', value: coach.suggestion!.price }).catch(() => {}); showToast(`Added ${coach.suggestion!.name}`); }}>
                Add {coach.suggestion.name} to order
              </button>
            </>
          ) : (
            <p className="w-sable-body" style={{ marginTop: 12 }}>{coach.whyItWorks || 'The table looks well matched — offer dessert when they slow down.'}</p>
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
          <div className="w-saytable" style={{ marginTop: 14 }}>
            <div className="lbl">{somm.wine.name} · {money(somm.wine.price)}</div>
            <p className="quote" style={{ fontSize: 16 }}>{somm.explanation}</p>
            <button className="w-pair-add" style={{ marginTop: 10 }} onClick={() => { addToOrder(somm.wine!); showToast(`Added ${somm.wine!.name}`); }}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}
