import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon, Film, Star, Trash2, ArrowUp, ArrowDown, Plus, Search,
  Languages, Beef, Check, Link2, X,
} from 'lucide-react';
import { api } from '../../services/api';
import { LOCALES } from '../../i18n/locales';
import { useEnglishMenu } from '../../hooks/useEnglishMenu';
import type { MenuItem } from '../../types/menu';
import styles from './ContentPanel.module.css';

/**
 * Everything an owner should be able to change without a developer: which
 * photos and videos a dish has, in what order, which one leads, what each cut
 * says, which dishes come off it, and how any of it reads in another language.
 *
 * English is edited on the item itself (the Menu tab) and is the fallback for
 * every locale — so this screen deliberately offers no "English" option.
 */

type EntityType = 'MENU_ITEM' | 'COW_CUT';

interface MediaAsset {
  id: number;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  posterUrl: string;
  alt: string;
  caption: string;
  sortOrder: number;
  featured: boolean;
  visible: boolean;
}

interface CutItemLink {
  menuItemId: number;
  matchType: 'PRIMARY' | 'RELATED';
  label: string;
  menuItem: { id: number; name: string; price: number; visible: boolean };
}

interface Cut {
  id: number;
  slug: string;
  name: string;
  altName: string;
  description: string;
  texture: string;
  bestFor: string[];
  active: boolean;
  items: CutItemLink[];
}

const TRANSLATABLE: Record<EntityType, string[]> = {
  MENU_ITEM: ['name', 'description'],
  COW_CUT: ['name', 'altName', 'description', 'texture'],
};

/** English is the source of truth on the entity itself, never a Translation row. */
const TRANSLATION_LOCALES = LOCALES.filter(l => l.code !== 'en');

export function ContentPanel() {
  const [mode, setMode] = useState<'dishes' | 'cuts'>('dishes');
  return (
    <div className={styles.panel}>
      <div className={styles.modes}>
        <button className={`${styles.mode} ${mode === 'dishes' ? styles.modeOn : ''}`} onClick={() => setMode('dishes')}>
          <ImageIcon size={14} /> Dish media &amp; translations
        </button>
        <button className={`${styles.mode} ${mode === 'cuts' ? styles.modeOn : ''}`} onClick={() => setMode('cuts')}>
          <Beef size={14} /> Butchery cuts
        </button>
      </div>
      {mode === 'dishes' ? <DishContent /> : <CutContent />}
    </div>
  );
}

/* ── dishes ──────────────────────────────────────────────────────────────── */
// useEnglishMenu moved to hooks/useEnglishMenu.ts — a second, unrelated
// consumer (the butchery chart's cut matching) needed the exact same thing.

function DishContent() {
  const items = useEnglishMenu();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [coverage, setCoverage] = useState<{ items: number; locales: Array<{ locale: string; translated: number; percent: number }> } | null>(null);

  useEffect(() => {
    api.getTranslationCoverage()
      .then(d => setCoverage(d as typeof coverage))
      .catch(() => setCoverage(null));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
    return list.slice(0, 200);
  }, [items, query]);

  useEffect(() => {
    if (!selected && results.length > 0) setSelected(results[0]);
  }, [results, selected]);

  return (
    <div className={styles.split}>
      <aside className={styles.list}>
        <label className={styles.searchWrap}>
          <Search size={15} aria-hidden />
          <input
            className={styles.search}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${items.length} dishes`}
            aria-label="Search dishes"
          />
        </label>
        <ul className={styles.listItems}>
          {results.map(i => (
            <li key={i.dbId}>
              <button
                className={`${styles.listBtn} ${selected?.dbId === i.dbId ? styles.listBtnOn : ''}`}
                onClick={() => setSelected(i)}
              >
                {i.name}
              </button>
            </li>
          ))}
        </ul>
        {coverage && (
          <div className={styles.coverage}>
            <h4>Translation coverage</h4>
            <p className={styles.coverageNote}>{coverage.items} visible dishes</p>
            <ul>
              {TRANSLATION_LOCALES.map(l => {
                const row = coverage.locales.find(c => c.locale === l.code);
                return (
                  <li key={l.code}>
                    <span>{l.english}</span>
                    <span className={styles.coverageBar}>
                      <i style={{ width: `${row?.percent ?? 0}%` }} />
                    </span>
                    <span className={styles.coveragePct}>{row?.percent ?? 0}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </aside>

      <div className={styles.detail}>
        {selected?.dbId == null ? (
          <p className={styles.none}>Select a dish.</p>
        ) : (
          <>
            <header className={styles.detailHead}>
              <h3>{selected.name}</h3>
              <span className={styles.idTag}>#{selected.dbId}</span>
            </header>
            <MediaEditor key={`m-${selected.dbId}`} entityType="MENU_ITEM" entityId={selected.dbId} altDefault={selected.name} />
            <TranslationEditor key={`t-${selected.dbId}`} entityType="MENU_ITEM" entityId={selected.dbId} english={{ name: selected.name, description: selected.description || '' }} />
          </>
        )}
      </div>
    </div>
  );
}

/* ── cuts ────────────────────────────────────────────────────────────────── */

function CutContent() {
  const allItems = useEnglishMenu();
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');

  const load = useCallback(async () => {
    const d = await api.getAdminCuts().catch(() => ({ cuts: [] }));
    const list = (d as { cuts: Cut[] }).cuts || [];
    setCuts(list);
    setSelectedId(prev => prev ?? list[0]?.id ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cut = cuts.find(c => c.id === selectedId) ?? null;

  // Typing a description must not fire one PATCH per keystroke. The field
  // updates instantly; the write is debounced and coalesced per cut, so a
  // sentence costs one request instead of forty.
  const pendingRef = useRef<{ cutId: number; data: Record<string, unknown> } | null>(null);
  const timerRef = useRef<number>(0);

  useEffect(() => () => {
    // Unmounting mid-edit must still persist what was typed.
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (p) void api.updateAdminCut(p.cutId, p.data).catch(() => {});
  }, []);

  function patch(field: keyof Cut, value: unknown) {
    if (!cut) return;
    const cutId = cut.id;
    setCuts(cs => cs.map(c => (c.id === cutId ? { ...c, [field]: value } as Cut : c)));

    // Switching cut mid-debounce would otherwise write this edit to the next one.
    if (pendingRef.current && pendingRef.current.cutId !== cutId) {
      const stale = pendingRef.current;
      void api.updateAdminCut(stale.cutId, stale.data).catch(() => {});
      pendingRef.current = null;
    }
    pendingRef.current = { cutId, data: { ...(pendingRef.current?.data ?? {}), [field]: value } };
    setSaving(true);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) await api.updateAdminCut(p.cutId, p.data).catch(() => {});
      setSaving(false);
    }, 600);
  }

  const linkable = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    if (!q || !cut) return [];
    const linked = new Set(cut.items.map(i => i.menuItemId));
    return allItems.filter(i => !linked.has(i.dbId!) && i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [linkQuery, allItems, cut]);

  return (
    <div className={styles.split}>
      <aside className={styles.list}>
        <ul className={styles.listItems}>
          {cuts.map(c => (
            <li key={c.id}>
              <button
                className={`${styles.listBtn} ${selectedId === c.id ? styles.listBtnOn : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name}
                <span className={styles.listMeta}>{c.items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className={styles.detail}>
        {!cut ? <p className={styles.none}>No cuts configured.</p> : (
          <>
            <header className={styles.detailHead}>
              <h3>{cut.name}</h3>
              <span className={styles.idTag}>{cut.slug}</span>
              {saving && <span className={styles.saving}>Saving…</span>}
            </header>

            <section className={styles.block}>
              <h4>Copy</h4>
              <label className={styles.field}>
                <span>Name</span>
                <input value={cut.name} onChange={e => patch('name', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Other convention</span>
                <input value={cut.altName} onChange={e => patch('altName', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Texture</span>
                <input value={cut.texture} onChange={e => patch('texture', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Description</span>
                <textarea rows={4} value={cut.description} onChange={e => patch('description', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Best for</span>
                <input
                  value={cut.bestFor.join(', ')}
                  onChange={e => patch('bestFor', e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
                  placeholder="Braai, Grill, Pan-sear"
                />
              </label>
            </section>

            <section className={styles.block}>
              <h4>Dishes from this cut</h4>
              <ul className={styles.links}>
                {cut.items.map(l => (
                  <li key={l.menuItemId}>
                    <span className={styles.linkName}>{l.menuItem?.name ?? `#${l.menuItemId}`}</span>
                    <span className={`${styles.badge} ${l.matchType === 'RELATED' ? styles.badgeAlt : ''}`}>
                      {l.matchType === 'RELATED' ? (l.label || 'Related') : 'From this cut'}
                    </span>
                    <button
                      className={styles.iconBtn}
                      aria-label={`Unlink ${l.menuItem?.name}`}
                      onClick={async () => { await api.unlinkAdminCutItem(cut.id, l.menuItemId).catch(() => {}); void load(); }}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
                {cut.items.length === 0 && <li className={styles.none}>Nothing linked yet.</li>}
              </ul>

              <label className={styles.searchWrap}>
                <Link2 size={15} aria-hidden />
                <input
                  className={styles.search}
                  value={linkQuery}
                  onChange={e => setLinkQuery(e.target.value)}
                  placeholder="Link a dish to this cut…"
                  aria-label="Link a dish"
                />
              </label>
              {linkable.length > 0 && (
                <ul className={styles.suggest}>
                  {linkable.map(i => (
                    <li key={i.dbId}>
                      <button onClick={async () => {
                        await api.linkAdminCutItem(cut.id, { menuItemId: i.dbId!, matchType: 'PRIMARY' }).catch(() => {});
                        setLinkQuery('');
                        void load();
                      }}>
                        <Plus size={13} /> {i.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <MediaEditor key={`cm-${cut.id}`} entityType="COW_CUT" entityId={cut.id} altDefault={cut.name} />
            <TranslationEditor
              key={`ct-${cut.id}`}
              entityType="COW_CUT"
              entityId={cut.id}
              english={{ name: cut.name, altName: cut.altName, description: cut.description, texture: cut.texture }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── media gallery editor ────────────────────────────────────────────────── */

function MediaEditor({ entityType, entityId, altDefault }: {
  entityType: EntityType; entityId: number; altDefault: string;
}) {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api.getAdminMedia(entityType, entityId).catch(() => ({ media: [] }));
    setMedia((d as { media: MediaAsset[] }).media || []);
  }, [entityType, entityId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    const res = await api.addAdminMedia({ entityType, entityId, kind, url: url.trim(), alt: altDefault })
      .catch(e => ({ error: e instanceof Error ? e.message : 'Failed' }));
    setBusy(false);
    if ((res as { error?: string }).error) { setError((res as { error: string }).error); return; }
    setUrl('');
    void load();
  }

  async function move(index: number, delta: number) {
    const next = [...media];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next);                       // optimistic — the order is the whole point
    await api.reorderAdminMedia({ entityType, entityId, ids: next.map(m => m.id) }).catch(() => void load());
  }

  return (
    <section className={styles.block}>
      <h4>Photos &amp; videos <span className={styles.count}>{media.length}</span></h4>

      <ul className={styles.media}>
        {media.map((m, i) => (
          <li key={m.id} className={m.featured ? styles.mediaFeatured : ''}>
            <span className={styles.mediaKind}>{m.kind === 'VIDEO' ? <Film size={14} /> : <ImageIcon size={14} />}</span>
            <span className={styles.mediaUrl} title={m.url}>{m.url}</span>
            {m.featured && <span className={styles.badge}>Leads</span>}
            <button className={styles.iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
            <button className={styles.iconBtn} aria-label="Move down" disabled={i === media.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
            <button
              className={styles.iconBtn}
              aria-label="Make this the leading media"
              disabled={m.featured}
              onClick={async () => { await api.updateAdminMedia(m.id, { featured: true }).catch(() => {}); void load(); }}
            ><Star size={14} /></button>
            <button
              className={`${styles.iconBtn} ${styles.iconDanger}`}
              aria-label="Remove"
              onClick={async () => { await api.deleteAdminMedia(m.id).catch(() => {}); void load(); }}
            ><Trash2 size={14} /></button>
          </li>
        ))}
        {media.length === 0 && <li className={styles.none}>No gallery media yet.</li>}
      </ul>

      <div className={styles.addRow}>
        <select value={kind} onChange={e => setKind(e.target.value as 'IMAGE' | 'VIDEO')} aria-label="Media type">
          <option value="IMAGE">Photo</option>
          <option value="VIDEO">Video</option>
        </select>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void add(); }}
          placeholder="/Trump/Images/ribeye.webp"
          aria-label="Media path or URL"
        />
        <button className={styles.addBtn} onClick={() => void add()} disabled={busy || !url.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}

/* ── translation editor ──────────────────────────────────────────────────── */

function TranslationEditor({ entityType, entityId, english }: {
  entityType: EntityType; entityId: number; english: Record<string, string>;
}) {
  const fields = TRANSLATABLE[entityType];
  const [locale, setLocale] = useState(TRANSLATION_LOCALES[0].code);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api.getAdminTranslations(entityType, entityId).catch(() => ({ translations: [] }));
    const rows = (d as { translations: Array<{ locale: string; field: string; value: string }> }).translations || [];
    const next: Record<string, string> = {};
    for (const r of rows) if (r.locale === locale) next[r.field] = r.value;
    setValues(next);
  }, [entityType, entityId, locale]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    await api.saveAdminTranslations({ entityType, entityId, locale, fields: values }).catch(() => {});
    setBusy(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <section className={styles.block}>
      <h4><Languages size={14} /> Translations</h4>
      <p className={styles.blockNote}>
        Leave a field blank to fall back to English. English itself is edited on the dish.
      </p>

      <div className={styles.localeRow}>
        {TRANSLATION_LOCALES.map(l => (
          <button
            key={l.code}
            className={`${styles.localeBtn} ${locale === l.code ? styles.localeBtnOn : ''}`}
            onClick={() => setLocale(l.code)}
            title={l.native}
          >
            {l.code}
          </button>
        ))}
      </div>

      {fields.map(f => (
        <label className={styles.field} key={f}>
          <span>{f}<i className={styles.en}>{english[f] || '—'}</i></span>
          {f === 'description' ? (
            <textarea
              rows={3}
              dir="auto"
              value={values[f] || ''}
              onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))}
              placeholder="English is used when blank"
            />
          ) : (
            <input
              dir="auto"
              value={values[f] || ''}
              onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))}
              placeholder="English is used when blank"
            />
          )}
        </label>
      ))}

      <button className={styles.saveBtn} onClick={() => void save()} disabled={busy}>
        {saved ? <><Check size={14} /> Saved</> : 'Save translation'}
      </button>
    </section>
  );
}
