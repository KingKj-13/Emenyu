import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import {
  UtensilsCrossed, Tag, Clock, Sparkles, BarChart3, ShoppingCart,
  Plus, Trash2, Pencil, Image as ImageIcon, Eye, EyeOff, ArrowUp, ArrowDown, X,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { api, type Promotion, type HappyHour, type Special, type LiveCart, type AnalyticsDashboard } from '../services/api';
import { formatPrice } from '../lib/menuUtils';
import { resolveThumbnail } from '../lib/imageResolver';
import { useSocketEvent } from '../hooks/useSocket';
import type { MenuItem } from '../types/menu';
import { BADGES } from '../constants/promotions';
import styles from './AdminPage.module.css';

type AdminTab = 'menu' | 'promotions' | 'happyHour' | 'specials' | 'analytics' | 'liveCarts';

const TABS: { key: AdminTab; label: string; icon: typeof UtensilsCrossed }[] = [
  { key: 'menu', label: 'Menu Management', icon: UtensilsCrossed },
  { key: 'promotions', label: 'Deal of the Day', icon: Tag },
  { key: 'happyHour', label: 'Happy Hour', icon: Clock },
  { key: 'specials', label: 'Specials', icon: Sparkles },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'liveCarts', label: 'Live Carts', icon: ShoppingCart },
];

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('menu');

  return (
    <AppShell hideHeader>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Admin</h1>
          <nav className={styles.tabs}>
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </nav>
        </header>
        <main className={styles.content}>
          {tab === 'menu' && <MenuManagementTab />}
          {tab === 'promotions' && <PromotionsTab />}
          {tab === 'happyHour' && <HappyHourTab />}
          {tab === 'specials' && <SpecialsTab />}
          {tab === 'analytics' && <AnalyticsTab />}
          {tab === 'liveCarts' && <LiveCartsTab />}
        </main>
      </div>
    </AppShell>
  );
}

// ─────────────────────────────── Menu Management ───────────────────────────

interface AdminItem extends MenuItem {
  dbId: number;
}

function MenuManagementTab() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [categories, setCategories] = useState<{ id: number; title: string; sortOrder: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editItem, setEditItem] = useState<AdminItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getAdminMenuItems(), api.getMenuCategories()])
      .then(([itemsRes, catsRes]) => {
        setItems((itemsRes as AdminItem[]) || []);
        setCategories(catsRes || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filteredItems = useMemo(
    () => categoryFilter === 'all' ? items : items.filter(i => i.category === categoryFilter),
    [items, categoryFilter]
  );

  async function toggleAvailability(item: AdminItem) {
    await api.toggleMenuItemAvailability(item.dbId, item.available === false);
    load();
  }

  async function toggleVisibility(item: AdminItem) {
    await api.updateMenuItem(item.dbId, { visible: item.visible === false });
    load();
  }

  async function deleteItem(item: AdminItem) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    await api.deleteMenuItem(item.dbId);
    load();
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await api.createCategory(newCategoryName.trim());
    setNewCategoryName('');
    load();
  }

  async function moveCategory(id: number, direction: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(c => c.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    await api.reorderCategories(sorted.map(c => c.id));
    load();
  }

  if (loading) return <div className={styles.loading}><Spinner size={32} /></div>;

  return (
    <div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Categories</h2>
        </div>
        <form className={styles.inlineForm} onSubmit={createCategory}>
          <input
            className={styles.input}
            placeholder="New category name"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
          />
          <button className={styles.primaryBtn} type="submit"><Plus size={15} /> Add category</button>
        </form>
        <ul className={styles.categoryList}>
          {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c, i, arr) => (
            <li key={c.id} className={styles.categoryRow}>
              <span>{c.title}</span>
              <div className={styles.rowActions}>
                <button disabled={i === 0} onClick={() => moveCategory(c.id, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                <button disabled={i === arr.length - 1} onClick={() => moveCategory(c.id, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Menu Items ({filteredItems.length})</h2>
          <div className={styles.headerActions}>
            <select className={styles.select} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map(c => <option key={c.id} value={c.title}>{c.title}</option>)}
            </select>
            <button className={styles.primaryBtn} onClick={() => setCreatingItem(true)}><Plus size={15} /> New item</button>
          </div>
        </div>

        <div className={styles.itemGrid}>
          {filteredItems.map(item => (
            <div key={item.dbId} className={styles.itemRow}>
              <img
                src={resolveThumbnail(item)}
                alt={item.name}
                className={styles.itemThumb}
                onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
              />
              <div className={styles.itemInfo}>
                <strong>{item.name}</strong>
                <span className={styles.itemMeta}>{item.category} · {formatPrice(item.price)}</span>
              </div>
              <div className={styles.rowActions}>
                <button onClick={() => toggleAvailability(item)} title={item.available === false ? 'Mark available' : 'Mark sold out'}>
                  {item.available === false ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button onClick={() => toggleVisibility(item)} title={item.visible === false ? 'Show on menu' : 'Hide from menu'}>
                  {item.visible === false ? <ImageIcon size={15} opacity={0.4} /> : <ImageIcon size={15} />}
                </button>
                <button onClick={() => setEditItem(item)} title="Edit"><Pencil size={15} /></button>
                <button onClick={() => deleteItem(item)} title="Delete"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {editItem && (
        <ItemEditModal item={editItem} categories={categories} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); load(); }} />
      )}
      {creatingItem && (
        <ItemEditModal item={null} categories={categories} onClose={() => setCreatingItem(false)} onSaved={() => { setCreatingItem(false); load(); }} />
      )}
    </div>
  );
}

function ItemEditModal({ item, categories, onClose, onSaved }: {
  item: AdminItem | null;
  categories: { id: number; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || categories[0]?.title || '');
  const [price, setPrice] = useState(String(item?.price ?? ''));
  const [description, setDescription] = useState(item?.description || '');
  const [calories, setCalories] = useState(item?.calories || '');
  const [allergens, setAllergens] = useState(item?.allergens || '');
  const [spice, setSpice] = useState(item?.spice || '');
  const [popular, setPopular] = useState(Boolean(item?.popular));
  const [uploading, setUploading] = useState(false);
  const [imgPath, setImgPath] = useState(item?.img || '');
  const [saving, setSaving] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('mediaFile', file);
      const res = await api.uploadFile(formData);
      setImgPath(res.filePath);
      if (item) await api.updateMenuItemMedia(item.dbId, { img: res.filePath });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto() {
    if (!imgPath) return;
    const filename = imgPath.split('/').pop();
    if (filename) await api.deleteUpload(filename).catch(() => {});
    setImgPath('');
    if (item) await api.updateMenuItemMedia(item.dbId, { img: '' });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const patch = { name, category, price: Number(price) || 0, description, calories, allergens, spice, popular };
      if (item) {
        await api.updateMenuItem(item.dbId, patch);
      } else {
        await api.createMenuItem({ ...patch, category });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        <div className={styles.modalHeader}>
          <h3>{item ? 'Edit Item' : 'New Item'}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <label className={styles.field}>
          Photo
          <div className={styles.photoRow}>
            {imgPath && <img src={resolveThumbnail({ name, price: 0, img: imgPath })} alt="" className={styles.photoPreview} />}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
            {imgPath && <button type="button" className={styles.dangerBtn} onClick={handleDeletePhoto}><Trash2 size={13} /> Remove photo</button>}
          </div>
        </label>

        <label className={styles.field}>Name<input className={styles.input} value={name} onChange={e => setName(e.target.value)} required /></label>

        <label className={styles.field}>
          Category
          <select className={styles.select} value={category} onChange={e => setCategory(e.target.value)} required>
            {categories.map(c => <option key={c.id} value={c.title}>{c.title}</option>)}
          </select>
        </label>

        <label className={styles.field}>Price<input className={styles.input} type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required /></label>
        <label className={styles.field}>Description<textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={2} /></label>
        <label className={styles.field}>Allergens<input className={styles.input} value={allergens} onChange={e => setAllergens(e.target.value)} placeholder="e.g. Contains nuts, dairy" /></label>
        <label className={styles.field}>Calories<input className={styles.input} value={calories} onChange={e => setCalories(e.target.value)} /></label>
        <label className={styles.field}>Spice level<input className={styles.input} value={spice} onChange={e => setSpice(e.target.value)} placeholder="🌶️🌶️" /></label>
        <label className={styles.checkboxField}>
          <input type="checkbox" checked={popular} onChange={e => setPopular(e.target.checked)} /> Guest Favourite
        </label>

        <div className={styles.modalFooter}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Promotions (Deal of the Day) ──────────────

function PromotionsTab() {
  const [rows, setRows] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getPromotionsAdmin().then(setRows).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function remove(id: number) {
    if (!window.confirm('Delete this promotion?')) return;
    await api.deletePromotion(id);
    load();
  }

  async function toggleActive(row: Promotion) {
    await api.updatePromotion(row.id, { active: !row.active });
    load();
  }

  if (loading) return <div className={styles.loading}><Spinner size={32} /></div>;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Deal of the Day ({rows.length})</h2>
        <button className={styles.primaryBtn} onClick={() => setEditing('new')}><Plus size={15} /> New promotion</button>
      </div>
      <div className={styles.cardList}>
        {rows.length === 0 && <p className={styles.emptyHint}>No promotions yet.</p>}
        {rows.map(row => (
          <div key={row.id} className={styles.entityCard}>
            <div className={styles.entityInfo}>
              <div className={styles.entityTitleRow}>
                <strong>{row.title}</strong>
                {row.badge && <span className={styles.badgeChip}>{row.badge}</span>}
                {row.isLiveNow && <span className={styles.liveChip}>LIVE NOW</span>}
              </div>
              <span className={styles.entityMeta}>
                {row.description || 'No description'} · {row.startTime || '00:00'}–{row.endTime || '23:59'}
                {row.startDate && ` · from ${new Date(row.startDate).toLocaleDateString()}`}
                {row.endDate && ` to ${new Date(row.endDate).toLocaleDateString()}`}
              </span>
            </div>
            <div className={styles.rowActions}>
              <button onClick={() => toggleActive(row)} title={row.active ? 'Deactivate' : 'Activate'}>
                {row.active ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button onClick={() => setEditing(row)} title="Edit"><Pencil size={15} /></button>
              <button onClick={() => remove(row.id)} title="Delete"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <PromotionEditModal promotion={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function PromotionEditModal({ promotion, onClose, onSaved }: { promotion: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(promotion?.title || '');
  const [description, setDescription] = useState(promotion?.description || '');
  const [badge, setBadge] = useState(promotion?.badge || '');
  const [bannerImage, setBannerImage] = useState(promotion?.bannerImage || '');
  const [startDate, setStartDate] = useState(promotion?.startDate?.slice(0, 10) || '');
  const [endDate, setEndDate] = useState(promotion?.endDate?.slice(0, 10) || '');
  const [startTime, setStartTime] = useState(promotion?.startTime || '00:00');
  const [endTime, setEndTime] = useState(promotion?.endTime || '23:59');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('mediaFile', file);
      const res = await api.uploadFile(formData);
      setBannerImage(res.filePath);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { title, description, badge, bannerImage, startDate: startDate || null, endDate: endDate || null, startTime, endTime };
    try {
      if (promotion) await api.updatePromotion(promotion.id, payload);
      else await api.createPromotion(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        <div className={styles.modalHeader}>
          <h3>{promotion ? 'Edit Promotion' : 'New Deal of the Day'}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <label className={styles.field}>Title<input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} required /></label>
        <label className={styles.field}>Description<textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={2} /></label>
        <label className={styles.field}>
          Badge
          <select className={styles.select} value={badge} onChange={e => setBadge(e.target.value)}>
            <option value="">None</option>
            {BADGES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          Banner image
          <div className={styles.photoRow}>
            {bannerImage && <img src={bannerImage} alt="" className={styles.photoPreview} />}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
          </div>
        </label>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>Start date<input className={styles.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label className={styles.field}>End date<input className={styles.input} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
          <label className={styles.field}>Start time<input className={styles.input} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
          <label className={styles.field}>End time<input className={styles.input} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
        </div>
        <div className={styles.modalFooter}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Happy Hour ─────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function HappyHourTab() {
  const [rows, setRows] = useState<HappyHour[]>([]);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HappyHour | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getHappyHoursAdmin(), api.getAdminMenuItems()])
      .then(([hh, i]) => { setRows(hh); setItems((i as AdminItem[]) || []); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function remove(id: number) {
    if (!window.confirm('Delete this happy hour?')) return;
    await api.deleteHappyHour(id);
    load();
  }

  async function toggleActive(row: HappyHour) {
    await api.updateHappyHour(row.id, { active: !row.active });
    load();
  }

  if (loading) return <div className={styles.loading}><Spinner size={32} /></div>;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Happy Hour ({rows.length})</h2>
        <button className={styles.primaryBtn} onClick={() => setEditing('new')}><Plus size={15} /> New Happy Hour</button>
      </div>
      <div className={styles.cardList}>
        {rows.length === 0 && <p className={styles.emptyHint}>No happy hours yet.</p>}
        {rows.map(row => (
          <div key={row.id} className={styles.entityCard}>
            <div className={styles.entityInfo}>
              <div className={styles.entityTitleRow}>
                <strong>{row.name}</strong>
                <span className={styles.badgeChip}>-{row.discountPct}%</span>
                {row.isLiveNow && <span className={styles.liveChip}>LIVE NOW</span>}
              </div>
              <span className={styles.entityMeta}>
                {row.itemIds.length} item{row.itemIds.length !== 1 ? 's' : ''} · {row.startTime}–{row.endTime}
                {row.activeDays?.length ? ` · ${row.activeDays.map(d => DAY_LABELS[d]).join(', ')}` : ' · every day'}
              </span>
            </div>
            <div className={styles.rowActions}>
              <button onClick={() => toggleActive(row)} title={row.active ? 'Deactivate' : 'Activate'}>
                {row.active ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button onClick={() => setEditing(row)} title="Edit"><Pencil size={15} /></button>
              <button onClick={() => remove(row.id)} title="Delete"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <HappyHourEditModal happyHour={editing === 'new' ? null : editing} items={items} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function HappyHourEditModal({ happyHour, items, onClose, onSaved }: { happyHour: HappyHour | null; items: AdminItem[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(happyHour?.name || 'Happy Hour');
  const [discountPct, setDiscountPct] = useState(String(happyHour?.discountPct ?? 20));
  const [startTime, setStartTime] = useState(happyHour?.startTime || '16:00');
  const [endTime, setEndTime] = useState(happyHour?.endTime || '18:00');
  const [itemIds, setItemIds] = useState<number[]>(happyHour?.itemIds || []);
  const [activeDays, setActiveDays] = useState<number[]>(happyHour?.activeDays || []);
  const [saving, setSaving] = useState(false);

  function toggleDay(day: number) {
    setActiveDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }
  function toggleItem(id: number) {
    setItemIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name, discountPct: Number(discountPct) || 0, startTime, endTime, itemIds, activeDays };
    try {
      if (happyHour) await api.updateHappyHour(happyHour.id, payload);
      else await api.createHappyHour(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        <div className={styles.modalHeader}>
          <h3>{happyHour ? 'Edit Happy Hour' : 'New Happy Hour'}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <label className={styles.field}>Name<input className={styles.input} value={name} onChange={e => setName(e.target.value)} required /></label>
        <label className={styles.field}>Discount %<input className={styles.input} type="number" min={1} max={100} value={discountPct} onChange={e => setDiscountPct(e.target.value)} required /></label>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>Start time<input className={styles.input} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required /></label>
          <label className={styles.field}>End time<input className={styles.input} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required /></label>
        </div>
        <div className={styles.field}>
          Active days (none = every day)
          <div className={styles.dayChips}>
            {DAY_LABELS.map((label, i) => (
              <button type="button" key={label} className={`${styles.dayChip} ${activeDays.includes(i) ? styles.dayChipActive : ''}`} onClick={() => toggleDay(i)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          Items ({itemIds.length} selected)
          <div className={styles.itemPicker}>
            {items.map(item => (
              <label key={item.dbId} className={styles.pickerRow}>
                <input type="checkbox" checked={itemIds.includes(item.dbId)} onChange={() => toggleItem(item.dbId)} />
                {item.name} <span className={styles.itemMeta}>{formatPrice(item.price)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Specials ───────────────────────────────────

function SpecialsTab() {
  const [rows, setRows] = useState<Special[]>([]);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Special | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getSpecialsAdmin(), api.getAdminMenuItems()])
      .then(([sp, i]) => { setRows(sp); setItems((i as AdminItem[]) || []); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function remove(id: number) {
    if (!window.confirm('Delete this special?')) return;
    await api.deleteSpecial(id);
    load();
  }

  async function toggleActive(row: Special) {
    await api.updateSpecial(row.id, { active: !row.active });
    load();
  }

  if (loading) return <div className={styles.loading}><Spinner size={32} /></div>;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Daily Specials ({rows.length})</h2>
        <button className={styles.primaryBtn} onClick={() => setEditing('new')}><Plus size={15} /> New special</button>
      </div>
      <div className={styles.cardList}>
        {rows.length === 0 && <p className={styles.emptyHint}>No specials yet.</p>}
        {rows.map(row => (
          <div key={row.id} className={styles.entityCard}>
            <div className={styles.entityInfo}>
              <div className={styles.entityTitleRow}>
                <strong>{row.title}</strong>
                {row.discountPct != null && <span className={styles.badgeChip}>-{row.discountPct}%</span>}
                {row.isLiveNow && <span className={styles.liveChip}>LIVE NOW</span>}
              </div>
              <span className={styles.entityMeta}>
                {row.itemIds.length} item{row.itemIds.length !== 1 ? 's' : ''} · {row.startTime || '00:00'}–{row.endTime || '23:59'}
              </span>
            </div>
            <div className={styles.rowActions}>
              <button onClick={() => toggleActive(row)} title={row.active ? 'Deactivate' : 'Activate'}>
                {row.active ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button onClick={() => setEditing(row)} title="Edit"><Pencil size={15} /></button>
              <button onClick={() => remove(row.id)} title="Delete"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <SpecialEditModal special={editing === 'new' ? null : editing} items={items} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function SpecialEditModal({ special, items, onClose, onSaved }: { special: Special | null; items: AdminItem[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(special?.title || '');
  const [bannerImage, setBannerImage] = useState(special?.bannerImage || '');
  const [discountPct, setDiscountPct] = useState(special?.discountPct != null ? String(special.discountPct) : '');
  const [itemIds, setItemIds] = useState<number[]>(special?.itemIds || []);
  const [startDate, setStartDate] = useState(special?.startDate?.slice(0, 10) || '');
  const [endDate, setEndDate] = useState(special?.endDate?.slice(0, 10) || '');
  const [startTime, setStartTime] = useState(special?.startTime || '00:00');
  const [endTime, setEndTime] = useState(special?.endTime || '23:59');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleItem(id: number) {
    setItemIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('mediaFile', file);
      const res = await api.uploadFile(formData);
      setBannerImage(res.filePath);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title, bannerImage, itemIds,
      discountPct: discountPct === '' ? null : Number(discountPct),
      startDate: startDate || null, endDate: endDate || null, startTime, endTime,
    };
    try {
      if (special) await api.updateSpecial(special.id, payload);
      else await api.createSpecial(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        <div className={styles.modalHeader}>
          <h3>{special ? 'Edit Special' : 'New Special'}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <label className={styles.field}>Title<input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} required /></label>
        <label className={styles.field}>
          Banner image
          <div className={styles.photoRow}>
            {bannerImage && <img src={bannerImage} alt="" className={styles.photoPreview} />}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
          </div>
        </label>
        <label className={styles.field}>Discount % (optional)<input className={styles.input} type="number" min={1} max={100} value={discountPct} onChange={e => setDiscountPct(e.target.value)} /></label>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>Start date<input className={styles.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label className={styles.field}>End date<input className={styles.input} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
          <label className={styles.field}>Start time<input className={styles.input} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
          <label className={styles.field}>End time<input className={styles.input} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
        </div>
        <div className={styles.field}>
          Featured items ({itemIds.length} selected)
          <div className={styles.itemPicker}>
            {items.map(item => (
              <label key={item.dbId} className={styles.pickerRow}>
                <input type="checkbox" checked={itemIds.includes(item.dbId)} onChange={() => toggleItem(item.dbId)} />
                {item.name} <span className={styles.itemMeta}>{formatPrice(item.price)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? <Spinner size={16} /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────── Analytics ───────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnalyticsDashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loading}><Spinner size={32} /></div>;
  if (!data) return <p className={styles.emptyHint}>Analytics unavailable.</p>;

  const maxHour = Math.max(1, ...data.peakUsageHours.map(h => h.count));

  return (
    <div>
      <div className={styles.statGrid}>
        <StatCard label="Active Live Carts" value={data.activeLiveCarts} />
        <StatCard label="Active Guests" value={data.activeGuests} />
        <StatCard label="Daily Visitors" value={data.dailyVisitors} />
        <StatCard label="Weekly Visitors" value={data.weeklyVisitors} />
        <StatCard label="Monthly Visitors" value={data.monthlyVisitors} />
        <StatCard label="Available Items" value={data.availableItems} />
        <StatCard label="Unavailable Items" value={data.unavailableItems} />
      </div>

      <div className={styles.analyticsGrid}>
        <section className={styles.panel}>
          <h2>Most Viewed Items</h2>
          <RankedList rows={data.mostViewedItems.map(r => ({ label: r.name, value: r.count }))} />
        </section>

        <section className={styles.panel}>
          <h2>Most Added to Cart</h2>
          <RankedList rows={data.mostAddedToCart.map(r => ({ label: r.name, value: r.count }))} />
        </section>

        <section className={styles.panel}>
          <h2>Popular Categories</h2>
          <RankedList rows={data.popularCategories.map(r => ({ label: r.category, value: r.count }))} />
        </section>

        <section className={styles.panel}>
          <h2>Peak Usage Hours</h2>
          <div className={styles.hourChart}>
            {data.peakUsageHours.map(h => (
              <div key={h.hour} className={styles.hourBar} title={`${h.hour}:00 — ${h.count}`}>
                <div className={styles.hourBarFill} style={{ height: `${(h.count / maxHour) * 100}%` }} />
                <span className={styles.hourLabel}>{h.hour}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Deal of the Day Performance</h2>
          <RankedList rows={data.dealPerformance.map(r => ({ label: r.title, value: r.addToCartCount, muted: !r.active }))} />
        </section>

        <section className={styles.panel}>
          <h2>Happy Hour Performance</h2>
          <RankedList rows={data.happyHourPerformance.map(r => ({ label: r.name, value: r.addToCartCount, muted: !r.active }))} />
        </section>

        <section className={styles.panel}>
          <h2>Specials Performance</h2>
          <RankedList rows={data.specialsPerformance.map(r => ({ label: r.title, value: r.addToCartCount, muted: !r.active }))} />
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function RankedList({ rows }: { rows: { label: string; value: number; muted?: boolean }[] }) {
  if (rows.length === 0) return <p className={styles.emptyHint}>No data yet.</p>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className={styles.rankedList}>
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className={styles.rankedRow}>
          <span className={`${styles.rankedLabel} ${r.muted ? styles.rankedMuted : ''}`}>{r.label}</span>
          <div className={styles.rankedBarTrack}>
            <div className={styles.rankedBarFill} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className={styles.rankedValue}>{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────── Live Carts ──────────────────────────────────

function LiveCartsTab() {
  const [carts, setCarts] = useState<LiveCart[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getLiveCarts().then(setCarts).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useSocketEvent('liveCartsChanged', load);

  function estimate(cart: LiveCart['cart']) {
    return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  if (loading) return <div className={styles.loading}><Spinner size={32} /></div>;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Live Carts ({carts.length})</h2>
      </div>
      {carts.length === 0 && <p className={styles.emptyHint}>No active carts right now.</p>}
      <div className={styles.cardList}>
        {carts.map(cart => (
          <div key={cart.tableId} className={styles.entityCard}>
            <div className={styles.entityInfo}>
              <div className={styles.entityTitleRow}>
                <strong>{cart.tableId.replace(/^table/i, 'Table ')}</strong>
                <span className={styles.badgeChip}>{formatPrice(estimate(cart.cart))}</span>
              </div>
              <span className={styles.entityMeta}>
                {cart.cart.map(i => `${i.qty}× ${i.name}`).join(', ')} · updated {new Date(cart.updatedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
