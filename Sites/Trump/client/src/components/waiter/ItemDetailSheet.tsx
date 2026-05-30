import { useEffect, useState } from 'react';
import { X, Plus, Star, Sparkles, Minus } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import { resolveImage } from '../../lib/imageResolver';
import { dishStory } from '../../lib/dishStories';
import { money } from '../../lib/waiterFormat';
import type { CoachResponse } from '../../types/waiter';

type Pair = { name: string; price: number; img?: string; categoryType?: string; reason?: string };

const isDrinkPair = (p: Pair) => ['WINE', 'DRINK'].includes((p.categoryType || '').toUpperCase());

// A short waiter-friendly line for each pairing (alternatives arrive without one).
function pairNote(p: Pair, dishName: string): string {
  if (p.reason) return p.reason;
  const cat = (p.categoryType || '').toUpperCase();
  const n = (p.name || '').toLowerCase();
  const dish = (dishName || '').toLowerCase();
  if (cat === 'WINE') {
    if (/steak|beef|rump|fillet|tomahawk|ribeye|lamb|chop/.test(dish)) return 'A bold red that stands up to the richness of the cut.';
    if (/prawn|seafood|salmon|calamari|kingklip|hake|sushi|fish|oyster/.test(dish)) return 'A crisp, bright pour that lifts the seafood.';
    return 'A cellar pick chosen to complement the dish.';
  }
  if (cat === 'DRINK') {
    if (/beer|lager|cider/.test(n)) return 'An ice-cold pour — the easy grill companion.';
    if (/cocktail|margarita|mojito|martini|negroni|old fashioned|colada|cosmo/.test(n)) return 'A signature cocktail to set the mood.';
    if (/coffee|espresso|cognac|whisky|liqueur|digestif/.test(n)) return 'A warm digestif to round off the meal.';
    return 'A refreshing pour alongside this course.';
  }
  if (cat === 'DESSERT') return 'A sweet finish to send the table off happy.';
  if (cat === 'STARTER') return 'A light bite to open the table before mains.';
  if (/chips|fries/.test(n)) return 'The classic side — always a yes.';
  if (/salad/.test(n)) return 'A fresh balance against the mains.';
  if (/sauce|butter/.test(n)) return 'Drizzle over the top — it lifts the whole plate.';
  if (/garlic bread|bread/.test(n)) return 'Perfect for mopping up every last drop.';
  return 'A natural addition to round out the order.';
}

export function ItemDetailSheet() {
  const { openItem, setOpenItem, addToOrder, showToast, selectedTableId, shift } = useWaiter();
  const [qty, setQty] = useState(1);
  const [coach, setCoach] = useState<CoachResponse | null>(null);

  useEffect(() => {
    if (!openItem) return;
    setQty(1);
    setCoach(null);
    api.coach({ dishName: openItem.name, cart: [{ name: openItem.name, price: openItem.price }], tone: 'luxury' })
      .then(setCoach)
      .catch(() => setCoach(null));
  }, [openItem]);

  if (!openItem) return null;
  const item = openItem;
  const pairings = (coach ? [coach.suggestion, ...(coach.alternatives || [])] : []).filter(Boolean) as Pair[];
  const drinkPairs = pairings.filter(isDrinkPair);
  const foodPairs = pairings.filter(p => !isDrinkPair(p));
  const story = dishStory(item.name);

  const addMain = () => {
    addToOrder(item, qty);
    showToast(`Added ${qty}× ${item.name}`);
    setOpenItem(null);
  };

  const addPairing = (p: { name: string; price: number }) => {
    addToOrder(p);
    showToast(`Added ${p.name}`);
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: p.name, accepted: true, source: 'pairing', value: p.price }).catch(() => {});
    }
  };

  return (
    <>
      <div className="w-backdrop" onClick={() => setOpenItem(null)} />
      <div className="w-sheet">
        <div className="w-sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="w-sheet-close" onClick={() => setOpenItem(null)}><X size={18} /></button>
        </div>

        <div className="w-item-hero">
          {item.img && <img src={resolveImage(item)} alt={item.name} />}
          {item.chefPick && <span className="chef"><Star size={13} style={{ verticalAlign: '-2px' }} /> Chef's Pick</span>}
        </div>

        <div className="w-item-title">
          <h2>{item.name}</h2>
          <span className="price">{money(item.price)}</span>
        </div>
        {item.description && <p className="w-item-desc">{item.description}</p>}

        {story && (
          <div className="w-sable" style={{ marginTop: 18 }}>
            <div className="w-sable-head">
              <span className="w-sable-mark" style={{ background: 'rgba(212,175,55,0.16)' }}>📖</span>
              <span className="w-sable-title">{story.title}</span>
              <span className="w-sable-badge">WAITER</span>
            </div>
            <p className="w-sable-body" style={{ marginTop: 8 }}>{story.story}</p>
            {story.tip && (
              <div className="w-saytable">
                <div className="lbl">How to serve it</div>
                <p className="quote">{story.tip}</p>
              </div>
            )}
          </div>
        )}

        {coach && coach.sayToTable && (
          <div className="w-sable" style={{ marginTop: 18 }}>
            <div className="w-sable-head">
              <span className="w-sable-mark"><Sparkles size={17} /></span>
              <span className="w-sable-title">Chef Recommends</span>
              <span className="w-sable-badge">AI</span>
            </div>
            {coach.whyItWorks && <p className="w-sable-body">{coach.whyItWorks}</p>}
            <div className="w-saytable">
              <div className="lbl">Say to the table</div>
              <p className="quote">“{coach.sayToTable}”</p>
            </div>
            {drinkPairs.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--w-text3)', margin: '4px 0 6px' }}>Drink pairings</div>
                {drinkPairs.map((p, i) => (
                  <div key={`d-${p.name}-${i}`} className="w-pair-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="pn">{p.name}</div>
                      <div className="pr">{pairNote(p, item.name)}</div>
                    </div>
                    <span className="price" style={{ fontFamily: 'var(--w-font-display)', color: 'var(--w-gold-bright)' }}>{money(p.price)}</span>
                    <button className="w-pair-add" onClick={() => addPairing(p)}><Plus size={16} /></button>
                  </div>
                ))}
              </>
            )}
            {foodPairs.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--w-text3)', margin: '14px 0 6px' }}>Goes well with</div>
                {foodPairs.map((p, i) => (
                  <div key={`f-${p.name}-${i}`} className="w-pair-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="pn">{p.name}</div>
                      <div className="pr">{pairNote(p, item.name)}</div>
                    </div>
                    <span className="price" style={{ fontFamily: 'var(--w-font-display)', color: 'var(--w-gold-bright)' }}>{money(p.price)}</span>
                    <button className="w-pair-add" onClick={() => addPairing(p)}><Plus size={16} /></button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="w-btn-primary" style={{ flex: 1 }} onClick={addMain}>
            <Plus size={16} /> Add to order
          </button>
          <div className="w-stepper" style={{ padding: 6 }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))}><Minus size={16} /></button>
            <b>×{qty}</b>
            <button onClick={() => setQty(q => q + 1)}><Plus size={16} /></button>
          </div>
        </div>
      </div>
    </>
  );
}
