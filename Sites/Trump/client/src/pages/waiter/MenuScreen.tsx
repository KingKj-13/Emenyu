import { useMemo, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { useMenuData } from '../../context/MenuContext';
import { buildMenuSections, flattenMenu } from '../../lib/menuUtils';
import { resolveImage } from '../../lib/imageResolver';
import { money } from '../../lib/waiterFormat';
import type { MenuItem } from '../../types/menu';

function dietaryTags(item: MenuItem): string[] {
  const tags = (item as unknown as { dietary?: string[] }).dietary;
  return Array.isArray(tags) ? tags : [];
}

export function MenuScreen() {
  const { menuData } = useMenuData();
  const { selectedTableId, addToOrder, setOpenItem, showToast } = useWaiter();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');

  const sections = useMemo(() => buildMenuSections(menuData, new Set(), query), [menuData, query]);
  const allItems = useMemo(() => flattenMenu(menuData), [menuData]);
  const categories = ['All', ...sections.map(s => s.title)];

  const items: MenuItem[] = useMemo(() => {
    if (cat === 'All') {
      const q = query.toLowerCase();
      return q
        ? allItems.filter(i => [i.name, i.description].filter(Boolean).join(' ').toLowerCase().includes(q))
        : allItems;
    }
    const section = sections.find(s => s.title === cat);
    if (!section) return [];
    return [...section.items, ...section.subSections.flatMap(s => s.items)];
  }, [cat, sections, allItems, query]);

  const tableLabel = selectedTableId ? selectedTableId.replace('table', 'Table ') : '—';

  return (
    <div className="w-screen">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p className="w-eyebrow-dim">Adding to · {tableLabel}</p>
          <h1 className="w-display" style={{ fontSize: 32, marginTop: 4 }}>The Menu</h1>
        </div>
        <div className="w-bell" style={{ color: 'var(--w-gold)' }}><Search size={18} /></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--w-surface)', border: '1px solid var(--w-border)' }}>
        <Search size={16} color="var(--w-text3)" />
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--w-text)', outline: 'none' }}
          placeholder={`Search ${allItems.length} items…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="w-chips">
        {categories.map(c => (
          <button key={c} className={`w-chip ${cat === c ? 'active' : ''}`} onClick={() => { setCat(c); }}>{c}</button>
        ))}
      </div>

      <div className="w-menu-grid">
        {items.map((item, i) => {
          const tags = dietaryTags(item);
          return (
            <div key={`${item.name}-${i}`} className="w-menu-card" onClick={() => setOpenItem(item)}>
              <div className="w-menu-thumb">
                {item.img ? <img src={resolveImage(item)} alt={item.name} loading="lazy" /> : <span>// {item.name.split(' ')[0]}</span>}
                {item.chefPick && <span className="w-menu-badge">Chef</span>}
                {!item.chefPick && item.popular && <span className="w-menu-badge">New</span>}
                <button
                  className="w-menu-add"
                  onClick={e => { e.stopPropagation(); addToOrder(item); showToast(`Added ${item.name}`); }}
                  aria-label={`Add ${item.name}`}
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="w-menu-info">
                <div className="mn">{item.name}</div>
                <div className="mfoot">
                  <span className="mp">{money(item.price)}</span>
                  {tags.length > 0 && <span className="w-diet">{tags.map(t => <span key={t}>{t}</span>)}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="w-empty" style={{ gridColumn: '1/-1' }}>No items found.</p>}
      </div>
    </div>
  );
}
