import { useState, useEffect, useCallback, useRef, type ReactNode, type CSSProperties } from 'react';
import { ClipboardList, BookOpen, Users, MessageSquare, LogOut, RefreshCw, UtensilsCrossed, BarChart2, QrCode, Download, Printer, CalendarDays, LayoutGrid, Clock, Bell, Upload, Image as ImageIcon, Film, Link2, Trash2, Pencil, Plus, X, Sparkles, TrendingUp, Activity, ShieldCheck, Copy, Check, Star, Armchair, Brain, ChefHat, Route, Eye } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../hooks/useAuth';
import { useHomeBackGuard } from '../hooks/useHomeBackGuard';
import { api } from '../services/api';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatPrice, formatTableLabel } from '../lib/menuUtils';
import { sastTodayStartIso } from '../lib/businessDay';
import type { ChefRec, ChefRecInput, ChefRecType, ChefBeverageKind, RecommendationAnalytics, RecoTally, RecoInsightsResult, RecoInsight, BundleAdmin, BundleInput, BundleItemInput } from '../types/menu';
import type { WaiterTask, AiEvent, Guest } from '../types/waiter';
import styles from './AdminPage.module.css';
import { NotificationBell } from '../components/operations/NotificationBell';
import { OwnerOperations } from '../components/operations/OwnerOperations';
import { AuditViewer } from '../components/operations/AuditViewer';
import { AIPerformancePanel } from '../components/analytics/AIPerformancePanel';
import { ChefIntelligencePanel } from '../components/analytics/ChefIntelligencePanel';
import { CustomerJourneyPanel } from '../components/analytics/CustomerJourneyPanel';
import { EngagementPanel } from '../components/analytics/EngagementPanel';
import { ContentPanel } from '../components/content/ContentPanel';
import { BRAND_NAME, BRAND_TAGLINE, QR_BASE, ENDPOINTS } from '../constants/api';

type Tab = 'orders' | 'history' | 'accounts' | 'chat' | 'menu' | 'reports' | 'qrcodes' | 'reservations' | 'tables' | 'deals' | 'chefrecs' | 'recoanalytics' | 'bundles' | 'servicedesk' | 'operations' | 'audit' | 'engagement' | 'content' | 'aiperformance' | 'chefintel' | 'journey' | 'demo' | 'aievents' | 'guests' | 'verify';

interface Order {
  filename: string;
  tableId?: string;
  table_number?: string;
  timestamp?: string;
  items?: Array<{ name: string; price: number; qty: number }>;
  total?: number;
  subtotal?: number;
}

type ReportRange = 'today' | '7d' | '30d' | 'all';

interface Reservation {
  id: number;
  name: string;
  phone: string;
  partySize: number;
  date: string;
  notes: string;
  status: string;
  tableId: string;
}

interface AnalyticsSummary {
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
  topTable: string | null;
  topTableRevenue: number;
}

interface AnalyticsItem { name: string; quantity: number; revenue: number; }
interface AnalyticsTable { tableId: string; revenue: number; orderCount: number; }
interface AnalyticsHour { hour: number; count: number; }
interface RatingsData {
  average: number;
  count: number;
  recent: Array<{ id: number; rating: number; comment: string; tableId: string; createdAt: string }>;
}

interface AdminMenuItem {
  dbId: number;
  name: string;
  price: number;
  available: boolean;
  visible?: boolean;
  category: string;
  description?: string;
  calories?: string;
  allergens?: string;
  spice?: string;
  chefPick?: boolean;
  img?: string;
  video?: string;
  youtubeId?: string;
  imageVisible?: boolean;
  videoVisible?: boolean;
}

type ItemFormPayload = {
  name: string;
  category: string;
  price: number;
  description: string;
  calories: string;
  allergens: string;
  spice: string;
  available: boolean;
  chefPick: boolean;
};

interface CartItem { name: string; price: number; qty?: number; quantity?: number; note?: string; }
interface TableCartEntry { tableId: string; cart: CartItem[]; overrides: unknown[]; itemCount: number; total: number; }

interface Deal {
  items: Array<{ name: string; price: number; img?: string }>;
  price: number;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  activeDays?: number[];
}

export function AdminPage({ initialTab }: { initialTab?: Tab } = {}) {
  useHomeBackGuard();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab || 'orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<unknown[]>([]);
  const [chatLogs, setChatLogs] = useState<unknown[]>([]);
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
  const [menuTogglingId, setMenuTogglingId] = useState<number | null>(null);
  const [menuSelected, setMenuSelected] = useState<Set<number>>(new Set());
  const [menuBulkLoading, setMenuBulkLoading] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportRange, setReportRange] = useState<ReportRange>('7d');
  const [importingCsv, setImportingCsv] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [reportSummary, setReportSummary] = useState<AnalyticsSummary | null>(null);
  const [reportItems, setReportItems] = useState<AnalyticsItem[]>([]);
  const [reportTables, setReportTables] = useState<AnalyticsTable[]>([]);
  const [reportHours, setReportHours] = useState<AnalyticsHour[]>([]);
  const [reportRatings, setReportRatings] = useState<RatingsData | null>(null);
  const [reportTrend, setReportTrend] = useState<{ date: string; revenue: number; orders: number }[]>([]);
  const [reportTrendBucket, setReportTrendBucket] = useState<'day' | 'week' | 'month'>('day');
  const [reportLeaderboard, setReportLeaderboard] = useState<{ rank: number; waiterName: string; salesDriven: number; tips: number; tablesServed: number }[]>([]);
  const [reportKitchen, setReportKitchen] = useState<{ seated: number; cooking: number; ready: number; empty: number } | null>(null);
  const [tableCarts, setTableCarts] = useState<TableCartEntry[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [chefRecs, setChefRecs] = useState<ChefRec[]>([]);
  const [recoAnalytics, setRecoAnalytics] = useState<RecommendationAnalytics | null>(null);
  const [recoInsights, setRecoInsights] = useState<RecoInsightsResult | null>(null);
  const [recoFilters, setRecoFilters] = useState<{ range: ReportRange; category: string; source: string; rotationGroup: string; mode: string }>({ range: '7d', category: '', source: '', rotationGroup: '', mode: '' });
  const [bundles, setBundles] = useState<BundleAdmin[]>([]);
  const [serviceTasks, setServiceTasks] = useState<WaiterTask[]>([]);
  const [aiEvents, setAiEvents] = useState<AiEvent[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'item' | 'reservation' | 'deal' | 'account'>(null);
  const [editItem, setEditItem] = useState<AdminMenuItem | null>(null);
  const [menuCategoryNames, setMenuCategoryNames] = useState<string[]>([]);

  async function loadTab(t: Tab) {
    setTab(t);
    setLoading(true);
    try {
      if (t === 'orders') {
        const data = await api.getOrders();
        setOrders((data as Order[]) || []);
      } else if (t === 'history') {
        const data = await api.getHistory();
        setHistory((data as Order[]) || []);
      } else if (t === 'accounts') {
        const data = await api.getAccounts();
        setAccounts(data || []);
      } else if (t === 'chat') {
        const data = await api.getChatHistory();
        // Priority 2 (demo blocker pass 2) — stored/returned oldest-first
        // (append order); newest-first here so the message a presenter just
        // sent from the customer app is at the top of the list, not buried
        // at the bottom of a growing session's worth of chat.
        setChatLogs(data ? [...(data as unknown[])].reverse() : []);
      } else if (t === 'menu') {
        const data = await api.getAdminMenuItems();
        setMenuItems((data as AdminMenuItem[]) || []);
      } else if (t === 'reports') {
        await loadReports(reportRange);
        return;
      } else if (t === 'reservations') {
        const data = await api.getReservations(reservationDate);
        setReservations((data as Reservation[]) || []);
      } else if (t === 'tables') {
        const data = await api.getTableCarts();
        setTableCarts((data as TableCartEntry[]) || []);
      } else if (t === 'deals') {
        const data = await api.getDeals();
        setDeals((data as Deal[]) || []);
      } else if (t === 'chefrecs') {
        const [recs, items] = await Promise.all([api.getChefRecs(), api.getAdminMenuItems()]);
        setChefRecs((recs as ChefRec[]) || []);
        setMenuItems((items as AdminMenuItem[]) || []);
      } else if (t === 'recoanalytics') {
        await loadRecoAnalytics(recoFilters);
        return;
      } else if (t === 'bundles') {
        const data = await api.getBundlesAdmin();
        setBundles((data as BundleAdmin[]) || []);
      } else if (t === 'servicedesk') {
        const data = await api.getWaiterTasks({ status: 'all' });
        setServiceTasks((data as WaiterTask[]) || []);
      } else if (t === 'aievents') {
        const data = await api.getAiEvents({ status: 'all' });
        setAiEvents((data as AiEvent[]) || []);
      } else if (t === 'guests') {
        const data = await api.getGuests();
        setGuests((data as Guest[]) || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecoAnalytics(filters: typeof recoFilters) {
    setLoading(true);
    const { from, to } = getDateRange(filters.range);
    try {
      const [data, ins] = await Promise.all([
        api.getRecommendationAnalytics({
          from, to,
          category: filters.category || undefined,
          source: filters.source || undefined,
          rotationGroup: filters.rotationGroup || undefined,
          mode: filters.mode || undefined
        }),
        api.getRecommendationInsights({ from, to, mode: filters.mode || undefined })
      ]);
      setRecoAnalytics(data);
      setRecoInsights(ins);
    } catch {
      setRecoAnalytics(null);
      setRecoInsights(null);
    }
    setLoading(false);
  }

  function getDateRange(range: ReportRange): { from?: string; to?: string } {
    const now = new Date();
    const to = now.toISOString();
    if (range === 'today') {
      return { from: sastTodayStartIso(), to };
    }
    if (range === '7d') {
      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      return { from, to };
    }
    if (range === '30d') {
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      return { from, to };
    }
    return {};
  }

  async function loadReports(range: ReportRange) {
    setLoading(true);
    const params = getDateRange(range);
    const bucket: 'day' | 'week' | 'month' = range === 'all' ? 'month' : range === '30d' ? 'week' : 'day';
    const leaderboardPeriod = range === 'today' ? 'today' : range === '7d' ? 'week' : 'month';
    setReportTrendBucket(bucket);
    try {
      const [summary, items, tables, hours, ratings, trend, leaderboard, floor] = await Promise.all([
        api.getAnalyticsSummary(params),
        api.getAnalyticsItems(params),
        api.getAnalyticsTables(params),
        api.getAnalyticsHours(params),
        api.getRatings(params),
        api.getAnalyticsTrend({ ...params, bucket }).catch(() => ({ bucket, points: [] })),
        api.getWaiterLeaderboard({ period: leaderboardPeriod }).catch(() => ({ leaderboard: [] })),
        api.getFloor().catch(() => null),
      ]);
      setReportSummary(summary as AnalyticsSummary);
      setReportItems((items as AnalyticsItem[]) || []);
      setReportTables((tables as AnalyticsTable[]) || []);
      setReportHours((hours as AnalyticsHour[]) || []);
      setReportRatings(ratings as RatingsData || null);
      setReportTrend(trend.points || []);
      setReportLeaderboard(leaderboard.leaderboard || []);
      setReportKitchen(floor?.counts || null);
    } catch {}
    setLoading(false);
  }

  const handleToggleAvailability = useCallback(async (item: AdminMenuItem) => {
    setMenuTogglingId(item.dbId);
    try {
      await api.toggleMenuItemAvailability(item.dbId, !item.available);
      setMenuItems(prev => prev.map(i => i.dbId === item.dbId ? { ...i, available: !i.available } : i));
    } catch {}
    setMenuTogglingId(null);
  }, []);

  const handleDeleteItem = useCallback(async (item: AdminMenuItem) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteMenuItem(item.dbId);
      setMenuItems(prev => prev.filter(i => i.dbId !== item.dbId));
      setMenuSelected(prev => { const s = new Set(prev); s.delete(item.dbId); return s; });
    } catch {}
  }, []);

  const handleBulkAction = useCallback(async (action: 'hide' | 'show' | 'delete') => {
    if (menuSelected.size === 0) return;
    if (action === 'delete' && !confirm(`Delete ${menuSelected.size} items? This cannot be undone.`)) return;
    setMenuBulkLoading(true);
    const ids = Array.from(menuSelected);
    try {
      await api.bulkMenuItemAction(action, ids);
      if (action === 'delete') {
        setMenuItems(prev => prev.filter(i => !menuSelected.has(i.dbId)));
      } else {
        setMenuItems(prev => prev.map(i => menuSelected.has(i.dbId) ? { ...i, visible: action === 'show' } : i));
      }
      setMenuSelected(new Set());
    } catch {}
    setMenuBulkLoading(false);
  }, [menuSelected]);

  const handleUpdateMenuItemMedia = useCallback(async (id: number, patch: Partial<AdminMenuItem>) => {
    const res = await api.updateMenuItemMedia(id, patch);
    const updated = (res.item || patch) as Partial<AdminMenuItem>;
    setMenuItems(prev => prev.map(item => item.dbId === id ? { ...item, ...patch, ...updated } : item));
  }, []);

  // ── Chef recommendations (owner controls — Phase 3, Task 8) ──
  const handleCreateChefRec = useCallback(async (input: ChefRecInput): Promise<string | null> => {
    try {
      await api.createChefRec(input);
      // Re-fetch so the new row arrives enriched with source/target names.
      setChefRecs((await api.getChefRecs() as ChefRec[]) || []);
      return null;
    } catch {
      return 'Could not add — it may already exist, or the database is unavailable.';
    }
  }, []);

  const handleUpdateChefRec = useCallback(async (id: number, patch: Partial<ChefRecInput>) => {
    setChefRecs(prev => prev.map(r => r.id === id ? { ...r, ...patch } as ChefRec : r));
    try { await api.updateChefRec(id, patch); } catch { /* keep optimistic value */ }
  }, []);

  const handleDeleteChefRec = useCallback(async (id: number) => {
    if (!confirm('Delete this chef recommendation?')) return;
    try { await api.deleteChefRec(id); setChefRecs(prev => prev.filter(r => r.id !== id)); } catch { /* ignore */ }
  }, []);

  // ── Recommended-order bundles (Phase 5, Task 1) ──
  const reloadBundles = useCallback(async () => {
    try { setBundles((await api.getBundlesAdmin() as BundleAdmin[]) || []); } catch { /* ignore */ }
  }, []);

  const handleCreateBundle = useCallback(async (input: BundleInput): Promise<string | null> => {
    try { await api.createBundle(input); await reloadBundles(); return null; }
    catch { return 'Could not create the bundle — the database may be unavailable.'; }
  }, [reloadBundles]);

  const handleUpdateBundle = useCallback(async (id: number, patch: Partial<BundleInput>) => {
    setBundles(prev => prev.map(b => b.id === id ? { ...b, ...patch } as BundleAdmin : b));
    try { await api.updateBundle(id, patch); } catch { reloadBundles(); }
  }, [reloadBundles]);

  const handleDeleteBundle = useCallback(async (id: number) => {
    if (!confirm('Delete this bundle?')) return;
    try { await api.deleteBundle(id); setBundles(prev => prev.filter(b => b.id !== id)); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTab(initialTab || 'orders'); }, []);

  async function handleComplete(filename: string) {
    setActionLoading(filename);
    try {
      await api.completeOrder(filename);
      setOrders(prev => prev.filter(o => o.filename !== filename));
    } catch {}
    setActionLoading(null);
  }

  async function handleDelete(type: 'orders' | 'history', filename: string) {
    if (!confirm(`Delete order ${filename}?`)) return;
    setActionLoading(filename);
    try {
      await api.deleteOrder(type, filename);
      if (type === 'orders') setOrders(prev => prev.filter(o => o.filename !== filename));
      else setHistory(prev => prev.filter(o => o.filename !== filename));
    } catch {}
    setActionLoading(null);
  }

  async function loadCategoryNames() {
    try {
      const cats = await api.getMenuCategories();
      setMenuCategoryNames((cats || []).map(c => c.title));
    } catch { setMenuCategoryNames([]); }
  }

  async function openNewItem() {
    setEditItem(null);
    setModal('item');
    await loadCategoryNames();
  }

  async function openEditItem(item: AdminMenuItem) {
    setEditItem(item);
    setModal('item');
    await loadCategoryNames();
  }

  function closeItemModal() {
    setModal(null);
    setEditItem(null);
  }

  async function openNewDeal() {
    setModal('deal');
    if (menuItems.length === 0) {
      try {
        const data = await api.getAdminMenuItems();
        setMenuItems((data as AdminMenuItem[]) || []);
      } catch {}
    }
  }

  async function handleSubmitItem(payload: ItemFormPayload) {
    if (editItem) {
      const res = await api.updateMenuItem(editItem.dbId, payload);
      const updated = res?.item as AdminMenuItem | undefined;
      if (updated) setMenuItems(prev => prev.map(i => i.dbId === editItem.dbId ? { ...i, ...updated } : i));
      closeItemModal();
      if (tab !== 'menu') loadTab('menu');
      return;
    }
    const res = await api.createMenuItem(payload);
    const created = res?.item as AdminMenuItem | undefined;
    if (created) setMenuItems(prev => [...prev, created]);
    closeItemModal();
    if (tab !== 'menu') loadTab('menu');
  }

  async function handleUpdateAccountStatus(username: string, status: 'active' | 'suspended') {
    await api.updateAccount(username, { status });
    const data = await api.getAccounts();
    setAccounts(data || []);
  }

  async function handleCreateReservation(payload: { name: string; phone: string; partySize: number; date: string; notes: string }) {
    await api.createReservation(payload);
    setModal(null);
    const onDate = payload.date.slice(0, 10);
    setReservationDate(onDate);
    const data = await api.getReservations(onDate);
    setReservations((data as Reservation[]) || []);
    if (tab !== 'reservations') setTab('reservations');
  }

  async function handleCreateDeal(deal: Deal) {
    const next = [...deals, deal];
    await api.saveDeals(next);
    setDeals(next);
    setModal(null);
    if (tab !== 'deals') setTab('deals');
  }

  async function handleCreateAccount(payload: { username: string; password: string; role: string; label: string }) {
    await api.createAccount(payload);
    // Deliberately NOT closing the modal: NewAccountModal switches to a success
    // view with the waiter-app APK link + username for the manager to copy.
    const data = await api.getAccounts();
    setAccounts(data || []);
    if (tab !== 'accounts') loadTab('accounts');
  }

  function exportHistoryCsv() {
    const rows = [['Table', 'Time', 'Items', 'Total']];
    history.forEach(o => {
      rows.push([
        String(o.tableId || o.table_number || ''),
        o.timestamp ? new Date(o.timestamp).toLocaleString() : '',
        String(o.items?.length ?? ''),
        String(o.total ?? o.subtotal ?? ''),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportReportsCsv() {
    const rows = [['Item', 'Quantity sold', 'Revenue']];
    reportItems.forEach(it => rows.push([it.name, String(it.quantity), String(it.revenue)]));
    rows.push([]);
    rows.push(['Table', 'Revenue', 'Orders']);
    reportTables.forEach(t => rows.push([t.tableId, String(t.revenue), String(t.orderCount)]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${reportRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportOrdersCsv(file: File) {
    setImportingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.importOrdersCsv(formData);
      const errorNote = result.errors.length ? `\n\n${result.errors.slice(0, 5).join('\n')}` : '';
      alert(
        `Imported ${result.ordersCreated} order${result.ordersCreated !== 1 ? 's' : ''} `
        + `(${result.itemsImported} item${result.itemsImported !== 1 ? 's' : ''}).`
        + (result.skippedRows ? ` ${result.skippedRows} row(s) skipped.` : '')
        + errorNote
      );
      await loadReports(reportRange);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'CSV import failed');
    }
    setImportingCsv(false);
  }

  const liveCovers = tableCarts.filter(t => t.itemCount > 0).length;

  const NAV_GROUPS: { label: string; items: { key: Tab; label: string; icon: typeof ClipboardList; badge?: number }[] }[] = [
    { label: 'SERVICE', items: [
      { key: 'orders', label: 'Orders', icon: ClipboardList, badge: orders.length || undefined },
      { key: 'servicedesk', label: 'Service Desk', icon: Bell, badge: serviceTasks.filter(t => ['open', 'acknowledged'].includes(t.status)).length || undefined },
      { key: 'aievents', label: 'AI Events', icon: Sparkles, badge: aiEvents.filter(e => e.status === 'open').length || undefined },
      { key: 'guests', label: 'Guests', icon: Users },
      { key: 'history', label: 'History', icon: BookOpen },
      { key: 'tables', label: 'Tables', icon: LayoutGrid },
      { key: 'reservations', label: 'Reservations', icon: CalendarDays },
    ] },
    { label: 'MENU & OFFERS', items: [
      { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
      { key: 'content', label: 'Media & Languages', icon: ImageIcon },
      { key: 'chefrecs', label: 'Chef Recs', icon: Sparkles },
      { key: 'bundles', label: 'Bundles', icon: LayoutGrid },
      { key: 'deals', label: 'Deals', icon: Clock },
      { key: 'qrcodes', label: 'QR Codes', icon: QrCode },
      { key: 'demo', label: 'Curated Demo', icon: Sparkles },
    ] },
    { label: 'INSIGHT', items: [
      { key: 'reports', label: 'Reports', icon: BarChart2 },
      { key: 'engagement', label: 'Guest Engagement', icon: Eye },
      { key: 'recoanalytics', label: 'Reco Analytics', icon: TrendingUp },
      { key: 'aiperformance', label: 'AI Performance', icon: Brain },
      { key: 'chefintel', label: 'Chef Intelligence', icon: ChefHat },
      { key: 'journey', label: 'Customer Journey', icon: Route },
      { key: 'accounts', label: 'Accounts', icon: Users },
      { key: 'chat', label: 'Chat Logs', icon: MessageSquare },
    ] },
    { label: 'OPERATIONS', items: [
      { key: 'operations', label: 'Operations', icon: Activity },
      { key: 'audit', label: 'Audit Trail', icon: ShieldCheck },
      { key: 'verify', label: 'Verify Data', icon: Check },
    ] },
  ];

  const refreshAction = (
    <button className={styles.actionBtn} onClick={() => loadTab(tab)}><RefreshCw size={14} /> Refresh</button>
  );

  const PAGE_HEADS: Record<Tab, { eyebrow: string; title: string; sub: string; actions?: ReactNode }> = {
    orders: { eyebrow: 'SERVICE · LIVE', title: 'Live orders', sub: `${orders.length} active ticket${orders.length !== 1 ? 's' : ''}`, actions: <><span className={styles.livePill}><span className={styles.liveDot} /> {liveCovers} live covers</span>{refreshAction}</> },
    servicedesk: { eyebrow: 'SERVICE · LIVE', title: 'Service desk', sub: 'Approvals, manager dispatch & live floor requests', actions: <><span className={styles.livePill}><span className={styles.liveDot} /> Live</span>{refreshAction}</> },
    aievents: { eyebrow: 'AI SHARED EVENTS', title: 'AI Events', sub: `${aiEvents.filter(e => e.status === 'open').length} open · same events the waiter app sees, one shared source`, actions: refreshAction },
    guests: { eyebrow: 'GUEST CRM', title: 'Guests', sub: `${guests.length} guest${guests.length !== 1 ? 's' : ''} · loyalty, dietary & VIP profile`, actions: refreshAction },
    verify: { eyebrow: 'INTERNAL TOOL', title: 'Verify Data', sub: 'Database vs. backend API, side by side, for a given table' },
    history: { eyebrow: 'COMPLETED', title: 'Order history', sub: `${history.length} settled order${history.length !== 1 ? 's' : ''}`, actions: <button className={styles.actionBtn} onClick={exportHistoryCsv}><Download size={14} /> Export CSV</button> },
    tables: { eyebrow: 'LIVE FLOOR', title: 'Tables', sub: `${liveCovers} active cart${liveCovers !== 1 ? 's' : ''} · manager override`, actions: <><span className={styles.livePill}><span className={styles.liveDot} /> Live sync</span>{refreshAction}</> },
    reservations: { eyebrow: 'BOOKINGS', title: 'Reservations', sub: `${reservations.length} booking${reservations.length !== 1 ? 's' : ''}`, actions: <button className={styles.actionBtnGold} onClick={() => setModal('reservation')}><Plus size={14} /> New booking</button> },
    menu: { eyebrow: 'MENU MANAGEMENT', title: 'The menu', sub: `${menuItems.length} item${menuItems.length !== 1 ? 's' : ''}`, actions: <><button className={styles.actionBtnGold} onClick={openNewItem}><Plus size={14} /> New item</button>{refreshAction}</> },
    chefrecs: { eyebrow: 'CHEF CURATION', title: 'Chef recommendations', sub: `${chefRecs.length} pairing${chefRecs.length !== 1 ? 's' : ''} · always shown ahead of automatic suggestions`, actions: refreshAction },
    recoanalytics: { eyebrow: 'ANALYTICS', title: 'Recommendation performance', sub: `${recoAnalytics?.eventCount ?? 0} events · impression → click → accept → order`, actions: refreshAction },
    bundles: { eyebrow: 'CURATED MENUS', title: 'Recommended orders', sub: `${bundles.length} persona bundle${bundles.length !== 1 ? 's' : ''} · the menu "Not sure what to order?" strip`, actions: refreshAction },
    deals: { eyebrow: 'OFFERS', title: 'Deals', sub: 'Bundle dishes into featured set menus', actions: <button className={styles.actionBtnGold} onClick={openNewDeal}><Plus size={14} /> New deal</button> },
    qrcodes: { eyebrow: 'TABLE QR CODES', title: 'QR codes', sub: 'Each links a guest straight to its table session' },
    demo: { eyebrow: 'LIVE DEMO', title: 'Curated Demo', sub: 'Toggle the curated dining journeys and redeem guest reward codes' },
    reports: {
      eyebrow: 'ANALYTICS', title: 'Reports', sub: 'Revenue, top items, peak hours & guest ratings',
      actions: (
        <>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleImportOrdersCsv(file);
            }}
          />
          <button
            className={styles.actionBtn}
            onClick={() => csvInputRef.current?.click()}
            disabled={importingCsv}
          >
            <Upload size={14} /> {importingCsv ? 'Importing…' : 'Import order history (CSV/Excel)'}
          </button>
          <button className={styles.actionBtn} onClick={exportReportsCsv}><Download size={14} /> Export CSV</button>
        </>
      ),
    },
    content: { eyebrow: 'CONTENT', title: 'Media & Languages', sub: 'Photos, videos, butchery cuts and translations — no deploy needed' },
    engagement: { eyebrow: 'ANALYTICS', title: 'Guest Engagement', sub: 'What guests looked at, for how long, and in which language' },
    aiperformance: { eyebrow: 'ANALYTICS', title: 'AI Performance', sub: 'Recommendations made, accepted, and the revenue behind them' },
    chefintel: { eyebrow: 'ANALYTICS', title: 'Chef Intelligence', sub: 'Best & worst sellers, wine pairings, pricing tier & trends' },
    journey: { eyebrow: 'ANALYTICS', title: 'Customer Journey', sub: 'One table’s visit, course by course' },
    accounts: { eyebrow: 'STAFF', title: 'Accounts', sub: `${accounts.length} team member${accounts.length !== 1 ? 's' : ''}`, actions: <button className={styles.actionBtnGold} onClick={() => setModal('account')}><Plus size={14} /> Add account</button> },
    chat: { eyebrow: 'AI SOMMELIER', title: 'Chat logs', sub: 'Guest conversations with the AI sommelier' },
    operations: { eyebrow: 'OPERATIONS · LIVE', title: 'Operations', sub: 'Live floor — staff on shift, table ownership, orders & alerts', actions: refreshAction },
    audit: { eyebrow: 'ACCOUNTABILITY', title: 'Audit trail', sub: 'Immutable record of every privileged staff action' },
  };
  const head = PAGE_HEADS[tab];
  const initials = (user?.label || user?.username || 'AD').slice(0, 2).toUpperCase();

  return (
    <AppShell requireRole={['owner', 'manager']} hideHeader>
      <div className={styles.console} data-admin-console>
        <div className={styles.topChrome}>
          <div className={styles.lights}><span /><span /><span /></div>
          <div className={styles.urlPill}><span className={styles.urlDot} /><span className={styles.urlText}>emenyu.com/admin · {BRAND_NAME} {BRAND_TAGLINE}</span></div>
          <div className={styles.chromeRight}><NotificationBell scope="all" /><NotificationButton /></div>
        </div>
        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <div className={styles.brand}>
              <div className={styles.brandLogo}>{BRAND_NAME.charAt(0)}</div>
              <div>
                <div className={styles.brandName}>{BRAND_NAME}</div>
                <div className={styles.brandSub}>{(user?.role || 'manager').toUpperCase()} CONSOLE</div>
              </div>
            </div>
            <nav className={styles.nav}>
              {NAV_GROUPS.map(group => (
                <div key={group.label} className={styles.navGroup}>
                  <div className={styles.navGroupLabel}>{group.label}</div>
                  {group.items.map(({ key, label, icon: Icon, badge }) => (
                    <button
                      key={key}
                      className={`${styles.navItem} ${tab === key ? styles.navItemActive : ''}`}
                      onClick={() => loadTab(key)}
                      aria-selected={tab === key}
                    >
                      <Icon size={16} />
                      <span className={styles.navItemLabel}>{label}</span>
                      {badge ? <span className={styles.navBadge}>{badge}</span> : null}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className={styles.userFooter}>
              <div className={styles.userAvatar}>{initials}</div>
              <div className={styles.userMeta}>
                <div className={styles.userName}>{user?.label || user?.username}</div>
                <div className={styles.userRole}>{user?.role}</div>
              </div>
              <button className={styles.logoutIcon} onClick={logout} aria-label="Sign out"><LogOut size={16} /></button>
            </div>
          </aside>

          <main className={styles.main}>
            <div className={styles.pageHead}>
              <div>
                <div className={styles.eyebrow}>{head.eyebrow}</div>
                <h1 className={styles.pageTitleNew}>{head.title}</h1>
                <div className={styles.pageSub}>{head.sub}</div>
              </div>
              {head.actions && <div className={styles.pageActions}>{head.actions}</div>}
            </div>
            <div className={styles.pageBody}>
              {loading ? (
                <div className={styles.loadingState}><Spinner size={36} /></div>
              ) : (
                <>
              {tab === 'orders' && (
                <OrderList
                  orders={orders}
                  actionLoading={actionLoading}
                  onComplete={handleComplete}
                  onDelete={f => handleDelete('orders', f)}
                />
              )}
              {tab === 'history' && (
                <OrderList
                  orders={history}
                  actionLoading={actionLoading}
                  isHistory
                  onDelete={f => handleDelete('history', f)}
                />
              )}
              {tab === 'accounts' && <AccountsList accounts={accounts} currentUsername={user?.username} onUpdateStatus={handleUpdateAccountStatus} />}
              {tab === 'chat' && <><LiveChatMonitor /><ChatLogList logs={chatLogs} /></>}
              {tab === 'content' && <ContentPanel />}
              {tab === 'engagement' && <EngagementPanel />}
              {tab === 'aiperformance' && <AIPerformancePanel />}
              {tab === 'chefintel' && <ChefIntelligencePanel />}
              {tab === 'journey' && <CustomerJourneyPanel />}
              {tab === 'operations' && <OwnerOperations />}
              {tab === 'audit' && <AuditViewer />}
              {tab === 'menu' && (
                <MenuAvailabilityList
                  items={menuItems}
                  togglingId={menuTogglingId}
                  selected={menuSelected}
                  bulkLoading={menuBulkLoading}
                  onToggle={handleToggleAvailability}
                  onEdit={openEditItem}
                  onDelete={handleDeleteItem}
                  onSelect={id => setMenuSelected(prev => {
                    const s = new Set(prev);
                    if (s.has(id)) s.delete(id); else s.add(id);
                    return s;
                  })}
                  onBulkAction={handleBulkAction}
                  onMediaChange={handleUpdateMenuItemMedia}
                />
              )}
              {tab === 'qrcodes' && <QrCodesPanel />}
              {tab === 'demo' && <CuratedDemoPanel />}
              {tab === 'tables' && (
                <TablesPanel
                  tableCarts={tableCarts}
                  onApplyOverride={async (tableId, overrides) => {
                    const { getSocket } = await import('../services/socket');
                    const socket = getSocket();
                    socket.emit('updateAdminOverrides', {
                      restaurantId: 'trump',
                      tableId,
                      overrides
                    });
                    setTableCarts(prev => prev.map(t => t.tableId === tableId ? { ...t, overrides } : t));
                  }}
                />
              )}
              {tab === 'deals' && (
                <DealsPanel
                  deals={deals}
                  onSave={async updated => {
                    try {
                      await api.saveDeals(updated);
                      setDeals(updated);
                    } catch { alert('Failed to save deals'); }
                  }}
                />
              )}
              {tab === 'reservations' && (
                <ReservationsPanel
                  reservations={reservations}
                  date={reservationDate}
                  onDateChange={async d => {
                    setReservationDate(d);
                    setLoading(true);
                    try {
                      const data = await api.getReservations(d);
                      setReservations((data as Reservation[]) || []);
                    } catch {}
                    setLoading(false);
                  }}
                  onStatusChange={async (id, status) => {
                    try {
                      await api.updateReservation(id, { status });
                      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
                    } catch {}
                  }}
                  onDelete={async id => {
                    if (!confirm('Cancel this reservation?')) return;
                    try {
                      await api.deleteReservation(id);
                      setReservations(prev => prev.filter(r => r.id !== id));
                    } catch {}
                  }}
                />
              )}
              {tab === 'reports' && (
                <ReportsPanel
                  range={reportRange}
                  summary={reportSummary}
                  items={reportItems}
                  tables={reportTables}
                  hours={reportHours}
                  ratings={reportRatings}
                  trend={reportTrend}
                  trendBucket={reportTrendBucket}
                  leaderboard={reportLeaderboard}
                  kitchen={reportKitchen}
                  onRangeChange={r => {
                    setReportRange(r);
                    loadReports(r);
                  }}
                />
              )}
              {tab === 'chefrecs' && (
                <ChefRecsPanel
                  recs={chefRecs}
                  menuItems={menuItems}
                  onCreate={handleCreateChefRec}
                  onUpdate={handleUpdateChefRec}
                  onDelete={handleDeleteChefRec}
                />
              )}
              {tab === 'recoanalytics' && (
                <RecoAnalyticsPanel
                  data={recoAnalytics}
                  insights={recoInsights}
                  filters={recoFilters}
                  onFilterChange={next => { setRecoFilters(next); loadRecoAnalytics(next); }}
                />
              )}
              {tab === 'bundles' && (
                <BundlesPanel
                  bundles={bundles}
                  onCreate={handleCreateBundle}
                  onUpdate={handleUpdateBundle}
                  onDelete={handleDeleteBundle}
                />
              )}
              {tab === 'servicedesk' && (
                <ServiceDeskPanel tasks={serviceTasks} onChange={setServiceTasks} />
              )}
              {tab === 'aievents' && (
                <AiEventsPanel events={aiEvents} onChange={setAiEvents} />
              )}
              {tab === 'guests' && (
                <GuestsPanel guests={guests} />
              )}
              {tab === 'verify' && (
                <VerifyPanel />
              )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
      {modal === 'item' && <NewItemModal categories={menuCategoryNames} item={editItem} onClose={closeItemModal} onSubmit={handleSubmitItem} />}
      {modal === 'reservation' && <NewReservationModal defaultDate={reservationDate} onClose={() => setModal(null)} onSubmit={handleCreateReservation} />}
      {modal === 'deal' && <NewDealModal menuItems={menuItems} onClose={() => setModal(null)} onSubmit={handleCreateDeal} />}
      {modal === 'account' && <NewAccountModal currentRole={user?.role} onClose={() => setModal(null)} onSubmit={handleCreateAccount} />}
    </AppShell>
  );
}

function OrderList({ orders, actionLoading, isHistory = false, onComplete, onDelete }: {
  orders: Order[];
  actionLoading: string | null;
  isHistory?: boolean;
  onComplete?: (f: string) => void;
  onDelete: (f: string) => void;
}) {
  if (orders.length === 0) return (
    <div className={styles.emptyState}>
      <ClipboardList size={40} className={styles.emptyIcon} />
      <p>No {isHistory ? 'completed' : 'active'} orders</p>
    </div>
  );

  return (
    <div className={styles.orderGrid}>
      {orders.map(order => (
        <div key={order.filename} className={styles.orderCard}>
          <div className={styles.orderHeader}>
            <span className={styles.orderTable}>
              {formatTableLabel(order.tableId || order.table_number || 'unknown table')}
            </span>
            {order.timestamp && (
              <span className={styles.orderTime}>
                {new Date(order.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          {order.items && order.items.length > 0 && (
            <div className={styles.orderItems}>
              {order.items.map((item, i) => (
                <div key={i} className={styles.orderItem}>
                  <span>{item.qty}× {item.name}</span>
                  <span>{formatPrice(item.price * item.qty)}</span>
                </div>
              ))}
            </div>
          )}

          {(order.total || order.subtotal) && (
            <div className={styles.orderTotal}>
              Total: {formatPrice((order.total || order.subtotal)!)}
            </div>
          )}

          <div className={styles.orderActions}>
            {!isHistory && onComplete && (
              <button
                className={styles.completeBtn}
                onClick={() => onComplete(order.filename)}
                disabled={actionLoading === order.filename}
              >
                {actionLoading === order.filename ? <Spinner size={14} /> : 'Complete'}
              </button>
            )}
            <button
              className={styles.deleteBtn}
              onClick={() => onDelete(order.filename)}
              disabled={actionLoading === order.filename}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountsList({ accounts, currentUsername, onUpdateStatus }: {
  accounts: unknown[];
  currentUsername?: string;
  onUpdateStatus: (username: string, status: 'active' | 'suspended') => Promise<void>;
}) {
  if (accounts.length === 0) return <div className={styles.emptyState}><p>No accounts found</p></div>;
  return (
    <div className={styles.accountList}>
      {(accounts as Array<{ username: string; role: string; label?: string; status?: string }>).map((acc, i) => (
        <AccountRow key={acc.username || i} acc={acc} isSelf={acc.username === currentUsername} onUpdateStatus={onUpdateStatus} />
      ))}
    </div>
  );
}

// Suspend / re-activate a staff account (parity with the retired vanilla admin).
// Calls the existing PATCH /api/auth/accounts/:username — no backend change. The
// account list returned by the server already excludes owners and accounts the
// actor cannot manage, so every listed row is actionable (self is still guarded).
function AccountRow({ acc, isSelf, onUpdateStatus }: {
  acc: { username: string; role: string; label?: string; status?: string };
  isSelf: boolean;
  onUpdateStatus: (username: string, status: 'active' | 'suspended') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const suspended = acc.status === 'suspended';
  async function toggle() {
    const next = suspended ? 'active' : 'suspended';
    if (next === 'suspended' && !confirm(`Suspend @${acc.username}? They will be signed out and unable to log in until reactivated.`)) return;
    setBusy(true);
    try { await onUpdateStatus(acc.username, next); }
    catch { alert('Could not update the account.'); }
    finally { setBusy(false); }
  }
  const roleVariant = acc.role === 'owner' ? 'purple' : acc.role === 'manager' ? 'gold' : 'muted';
  return (
    <div className={styles.accountRow}>
      <span className={styles.accName}>{acc.label || acc.username}</span>
      <span className={styles.accUsername}>@{acc.username}</span>
      <Badge variant={roleVariant}>{acc.role}</Badge>
      <Badge variant={suspended ? 'red' : 'gold'}>{acc.status || 'active'}</Badge>
      {!isSelf && (
        <button className={styles.actionBtn} onClick={toggle} disabled={busy} style={{ marginLeft: 'auto' }}>
          {busy ? <Spinner size={12} /> : suspended ? 'Activate' : 'Suspend'}
        </button>
      )}
    </div>
  );
}

// Live customer-chat + waiter-call monitor — restores the vanilla admin's "Current
// Chat" visibility. Reuses the existing global `newChatLog` broadcast and the
// admin-room `waiterCallAlert` event. No new backend events, no polling, no DB.
function LiveChatMonitor() {
  const [live, setLive] = useState<Array<{ tableId?: string; timestamp?: string; message?: string; reply?: string; is_special?: boolean }>>([]);
  const [alerts, setAlerts] = useState<Array<{ displayTable?: string; message?: string; timestamp?: string; type?: string }>>([]);

  useEffect(() => {
    let active = true;
    let cleanup = () => {};
    import('../services/socket').then(({ getSocket }) => {
      if (!active) return;
      const socket = getSocket();
      socket.emit('joinAdmin', { restaurantId: 'trump' });
      const onChat = (log: { tableId?: string; timestamp?: string; message?: string; reply?: string; is_special?: boolean }) =>
        setLive(prev => [log, ...prev].slice(0, 30));
      const onAlert = (a: { displayTable?: string; message?: string; timestamp?: string; type?: string }) =>
        setAlerts(prev => [a, ...prev].slice(0, 15));
      socket.on('newChatLog', onChat);
      socket.on('waiterCallAlert', onAlert);
      cleanup = () => { socket.off('newChatLog', onChat); socket.off('waiterCallAlert', onAlert); };
    });
    return () => { active = false; cleanup(); };
  }, []);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
        <strong style={{ fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.8 }}>Live activity</strong>
      </div>
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'rgba(var(--color-gold-rgb),0.12)', border: '1px solid rgba(var(--color-gold-rgb),0.3)' }}>
              <Bell size={14} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
              <span>{a.message || `${a.displayTable || 'A table'} called a waiter.`}</span>
              {a.timestamp && <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{a.timestamp}</span>}
            </div>
          ))}
        </div>
      )}
      {live.length === 0 ? (
        <div className={styles.emptyState}><p>Waiting for live customer chat — new questions appear here in real time.</p></div>
      ) : (
        <div className={styles.chatLogList}>
          {live.map((log, i) => (
            <div key={i} className={styles.chatLog}>
              <div className={styles.chatLogMeta}>
                <span>{formatTableLabel(log.tableId || 'unknown')}{log.is_special ? <Star size={12} fill="currentColor" className={styles.specialStar} /> : ''}</span>
                {log.timestamp && <span>{log.timestamp}</span>}
              </div>
              {log.message && <p className={styles.chatLogMsg}><strong>Q:</strong> {log.message}</p>}
              {log.reply && <p className={styles.chatLogReply}><strong>A:</strong> {log.reply}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatLogList({ logs }: { logs: unknown[] }) {
  if (logs.length === 0) return <div className={styles.emptyState}><p>No chat logs</p></div>;
  return (
    <div className={styles.chatLogList}>
      {(logs as Array<{ date?: string; timestamp?: string; tableId?: string; message?: string; reply?: string }>).map((log, i) => (
        <div key={i} className={styles.chatLog}>
          <div className={styles.chatLogMeta}>
            <span>{formatTableLabel(log.tableId || 'unknown')}</span>
            {/* aiService.appendChatLog stores `timestamp` as a bare "HH:MM"
                clock string (not an ISO datetime) alongside a separate `date`
                field -- new Date(log.timestamp) alone parsed to "Invalid
                Date". Render both stored fields as text instead of
                re-parsing them through Date. */}
            {log.timestamp && <span>{log.date ? `${log.date} ${log.timestamp}` : log.timestamp}</span>}
          </div>
          {log.message && <p className={styles.chatLogMsg}><strong>Q:</strong> {log.message}</p>}
          {log.reply && <p className={styles.chatLogReply}><strong>A:</strong> {log.reply}</p>}
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'rgba(var(--color-gold-rgb),0.15)',
  confirmed: 'rgba(34,197,94,0.12)',
  seated: 'rgba(99,102,241,0.15)',
  cancelled: 'rgba(239,68,68,0.1)'
};
const STATUS_TEXT: Record<string, string> = {
  pending: 'var(--color-gold)',
  confirmed: '#4ade80',
  seated: '#818cf8',
  cancelled: '#fca5a5'
};

function ReservationsPanel({ reservations, date, onDateChange, onStatusChange, onDelete }: {
  reservations: Reservation[];
  date: string;
  onDateChange: (d: string) => void;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div>
      <div className={styles.resvHeader}>
        <input
          type="date"
          className={styles.resvDateInput}
          value={date}
          onChange={e => onDateChange(e.target.value)}
        />
        <span className={styles.resvCount}>{reservations.length} reservation{reservations.length !== 1 ? 's' : ''}</span>
      </div>
      {reservations.length === 0 ? (
        <div className={styles.emptyState}><p>No reservations for this date.</p></div>
      ) : (
        <div className={styles.resvList}>
          {reservations.map(r => (
            <div key={r.id} className={styles.resvCard}>
              <div className={styles.resvCardHeader}>
                <div>
                  <span className={styles.resvName}>{r.name}</span>
                  {r.phone && <span className={styles.resvPhone}>{r.phone}</span>}
                </div>
                <span
                  className={styles.resvStatus}
                  style={{ background: STATUS_COLORS[r.status] || 'rgba(255,255,255,0.06)', color: STATUS_TEXT[r.status] || 'var(--color-sand)' }}
                >
                  {r.status}
                </span>
              </div>
              <div className={styles.resvMeta}>
                <span><Users size={12} /> {r.partySize} {r.partySize === 1 ? 'person' : 'people'}</span>
                <span><Clock size={12} /> {new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {r.tableId && <span><Armchair size={12} /> {formatTableLabel(r.tableId)}</span>}
              </div>
              {r.notes && <p className={styles.resvNotes}>{r.notes}</p>}
              <div className={styles.resvActions}>
                {r.status === 'pending' && (
                  <button className={`${styles.resvBtn} ${styles.resvBtnConfirm}`} onClick={() => onStatusChange(r.id, 'confirmed')}>Confirm</button>
                )}
                {(r.status === 'pending' || r.status === 'confirmed') && (
                  <button className={`${styles.resvBtn} ${styles.resvBtnSeat}`} onClick={() => onStatusChange(r.id, 'seated')}>Seat</button>
                )}
                {r.status !== 'cancelled' && (
                  <button className={`${styles.resvBtn} ${styles.resvBtnCancel}`} onClick={() => onDelete(r.id)}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABLE_COUNT = 15;

// Curated Demo Mode — the admin ON/OFF toggle (server/services/fileService.js's
// live settings.json, flipped instantly via socket broadcast, no restart —
// see settingsController.js) plus a simple staff-facing reward redemption
// widget for the Order Complete "your next drink is on us" QR.
function CuratedDemoPanel() {
  const [curatedDemoMode, setCuratedDemoMode] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [redeemResult, setRedeemResult] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    api.getSettings().then(s => setCuratedDemoMode(Boolean(s?.curatedDemoMode))).catch(() => setCuratedDemoMode(false));
  }, []);

  async function toggle() {
    if (curatedDemoMode === null || saving) return;
    const next = !curatedDemoMode;
    setSaving(true);
    setCuratedDemoMode(next); // optimistic — matches the menu-availability toggle pattern elsewhere in this page
    try {
      await api.saveSettings({ curatedDemoMode: next });
    } catch {
      setCuratedDemoMode(!next); // revert on failure
      alert('Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  }

  async function redeem() {
    const trimmed = code.trim();
    if (!trimmed || redeeming) return;
    setRedeeming(true);
    setRedeemResult(null);
    try {
      const result = await api.redeemReward(trimmed);
      setRedeemResult(result);
      if (result.ok) setCode('');
    } catch {
      setRedeemResult({ ok: false, reason: 'invalid' });
    } finally {
      setRedeeming(false);
    }
  }

  const REDEEM_LABELS: Record<string, string> = {
    already_redeemed: 'This reward has already been redeemed.',
    expired: 'This reward code has expired.',
    invalid: 'That code is not valid.',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', border: '1px solid rgba(var(--color-gold-rgb, 200,165,85),0.25)', borderRadius: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Curated Demo Mode</div>
          <div style={{ fontSize: 13, opacity: 0.75, maxWidth: 480 }}>
            When ON, the three hand-designed dining journeys (starter → main with skip alternatives → side → drink → dessert)
            replace the live algorithmic engine on chat, cart and waiter recommendation surfaces. When OFF, normal production
            behaviour is unchanged.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={curatedDemoMode === true}
          onClick={toggle}
          disabled={curatedDemoMode === null || saving}
          style={{
            width: 52, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: curatedDemoMode ? 'var(--color-gold, #c8a555)' : 'rgba(255,255,255,0.15)',
            position: 'relative', transition: 'background 160ms ease',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: curatedDemoMode ? 25 : 3, width: 24, height: 24, borderRadius: '50%',
            background: '#fff', transition: 'left 160ms ease',
          }} />
        </button>
      </div>

      <div style={{ padding: '18px 20px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Redeem a reward code</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>
          Enter the code the guest presents (from their "next drink is on us" QR) to mark it used, once, at the till.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="e.g. 42.aBcD..."
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)' }}
          />
          <button className={styles.actionBtnGold} onClick={redeem} disabled={!code.trim() || redeeming}>
            {redeeming ? 'Checking…' : 'Redeem'}
          </button>
        </div>
        {redeemResult && (
          <p style={{ marginTop: 10, fontSize: 13, color: redeemResult.ok ? '#5fcf8a' : '#e07a7a' }}>
            {redeemResult.ok ? 'Reward redeemed — one free drink, this visit only.' : (REDEEM_LABELS[redeemResult.reason || 'invalid'] || 'Could not redeem this code.')}
          </p>
        )}
      </div>
    </div>
  );
}

function QrCodesPanel() {
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const tables = Array.from({ length: TABLE_COUNT }, (_, i) => `table${i + 1}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Dynamic import to keep qrcode out of main bundle
        const QRCode = (await import('qrcode')).default;
        const entries: [string, string][] = await Promise.all(
          tables.map(async t => {
            const url = await QRCode.toDataURL(`${QR_BASE}/${t}`, {
              width: 200,
              margin: 2,
              color: { dark: '#001724', light: '#f5f0e8' }
            });
            return [t, url];
          })
        );
        if (!cancelled) setQrUrls(Object.fromEntries(entries));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  function downloadQr(tableId: string) {
    const url = qrUrls[tableId];
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableId}-qr.png`;
    a.click();
  }

  return (
    <div>
      <div className={styles.qrHeader}>
        <span className={styles.qrCount}>{TABLE_COUNT} tables</span>
        <button className={styles.printAllBtn} onClick={() => window.print()}>
          <Printer size={14} />
          Print All
        </button>
      </div>
      <div className={styles.qrGrid}>
        {tables.map(t => (
          <div key={t} className={styles.qrCard}>
            {qrUrls[t] ? (
              <img src={qrUrls[t]} alt={`QR for ${t}`} className={styles.qrImage} />
            ) : (
              <div className={styles.qrPlaceholder}><Spinner size={24} /></div>
            )}
            <div className={styles.qrTableName}>{t.replace(/^table/, 'Table ')}</div>
            <div className={styles.qrUrl}>{QR_BASE}/{t}</div>
            <button
              className={styles.qrDownloadBtn}
              onClick={() => downloadQr(t)}
              disabled={!qrUrls[t]}
            >
              <Download size={12} />
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const RANGE_LABELS: Record<ReportRange, string> = {
  today: 'Today',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  all: 'All Time'
};

function ReportsPanel({ range, summary, items, tables, hours, ratings, trend, trendBucket, leaderboard, kitchen, onRangeChange }: {
  range: ReportRange;
  summary: AnalyticsSummary | null;
  items: AnalyticsItem[];
  tables: AnalyticsTable[];
  hours: AnalyticsHour[];
  ratings: RatingsData | null;
  trend: { date: string; revenue: number; orders: number }[];
  trendBucket: 'day' | 'week' | 'month';
  leaderboard: { rank: number; waiterName: string; salesDriven: number; tips: number; tablesServed: number }[];
  kitchen: { seated: number; cooking: number; ready: number; empty: number } | null;
  onRangeChange: (r: ReportRange) => void;
}) {
  const maxTableRevenue = Math.max(...tables.map(t => t.revenue), 1);
  const maxHourCount = Math.max(...hours.map(h => h.count), 1);
  const maxTrendRevenue = Math.max(...trend.map(t => t.revenue), 1);

  return (
    <div className={styles.reportsPanel}>
      <div className={styles.rangeBar}>
        {(Object.keys(RANGE_LABELS) as ReportRange[]).map(r => (
          <button
            key={r}
            className={`${styles.rangeBtn} ${range === r ? styles.rangeBtnActive : ''}`}
            onClick={() => onRangeChange(r)}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {summary && (
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{formatPrice(summary.revenue)}</div>
            <div className={styles.summaryLabel}>Total Revenue</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.orderCount}</div>
            <div className={styles.summaryLabel}>Orders</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{formatPrice(summary.avgOrderValue)}</div>
            <div className={styles.summaryLabel}>Avg Order</div>
          </div>
          {summary.topTable && (
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue}>{summary.topTable.replace(/^table/, 'Table ')}</div>
              <div className={styles.summaryLabel}>Top Table</div>
            </div>
          )}
        </div>
      )}

      {!summary && (
        <div className={styles.emptyState}><p>No data for this period.</p></div>
      )}

      {trend.length > 0 && (
        <div className={styles.reportSection}>
          <h3 className={styles.reportSectionTitle}>Revenue trend ({trendBucket === 'day' ? 'daily' : trendBucket === 'week' ? 'weekly' : 'monthly'})</h3>
          <div className={styles.hoursChart}>
            {trend.map(t => (
              <div key={t.date} className={styles.hourBar}>
                <div
                  className={styles.hourBarFill}
                  style={{ height: `${(t.revenue / maxTrendRevenue) * 100}%` }}
                  title={`${t.date} — ${formatPrice(t.revenue)} (${t.orders} orders)`}
                />
                <span className={styles.hourLabel}>{t.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.reportsGrid}>
        {items.length > 0 && (
          <div className={styles.reportSection}>
            <h3 className={styles.reportSectionTitle}>Top Items</h3>
            <div className={styles.topItemsList}>
              {items.map((item, i) => (
                <div key={item.name} className={styles.topItemRow}>
                  <span className={styles.topItemRank}>#{i + 1}</span>
                  <span className={styles.topItemName}>{item.name}</span>
                  <span className={styles.topItemQty}>{item.quantity}×</span>
                  <span className={styles.topItemRev}>{formatPrice(item.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tables.length > 0 && (
          <div className={styles.reportSection}>
            <h3 className={styles.reportSectionTitle}>Revenue by Table</h3>
            <div className={styles.tableBarList}>
              {tables.map(t => (
                <div key={t.tableId} className={styles.tableBarRow}>
                  <span className={styles.tableBarLabel}>{t.tableId.replace(/^table/, 'T')}</span>
                  <div className={styles.tableBarTrack}>
                    <div
                      className={styles.tableBarFill}
                      style={{ width: `${(t.revenue / maxTableRevenue) * 100}%` }}
                    />
                  </div>
                  <span className={styles.tableBarValue}>{formatPrice(t.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {leaderboard.length > 0 && (
          <div className={styles.reportSection}>
            <h3 className={styles.reportSectionTitle}>Waiter performance</h3>
            <div className={styles.topItemsList}>
              {leaderboard.map(w => (
                <div key={w.waiterName} className={styles.topItemRow}>
                  <span className={styles.topItemRank}>#{w.rank}</span>
                  <span className={styles.topItemName}>{w.waiterName}</span>
                  <span className={styles.topItemQty}>{w.tablesServed} table{w.tablesServed !== 1 ? 's' : ''}</span>
                  <span className={styles.topItemRev}>{formatPrice(w.salesDriven)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {kitchen && (
          <div className={styles.reportSection}>
            <h3 className={styles.reportSectionTitle}>Kitchen performance</h3>
            <p style={{ fontSize: 11.5, opacity: .6, margin: '0 0 8px' }}>Live board right now — no per-order prep-time history is tracked yet</p>
            <div className={styles.summaryCards}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{kitchen.cooking}</div>
                <div className={styles.summaryLabel}>Cooking</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{kitchen.ready}</div>
                <div className={styles.summaryLabel}>Ready to serve</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{kitchen.seated}</div>
                <div className={styles.summaryLabel}>Seated, ordering</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{kitchen.empty}</div>
                <div className={styles.summaryLabel}>Empty tables</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {hours.some(h => h.count > 0) && (
        <div className={styles.reportSection}>
          <h3 className={styles.reportSectionTitle}>Peak Hours</h3>
          <div className={styles.hoursChart}>
            {hours.map(({ hour, count }) => (
              <div key={hour} className={styles.hourBar}>
                <div
                  className={styles.hourBarFill}
                  style={{ height: `${(count / maxHourCount) * 100}%` }}
                  title={`${hour}:00 — ${count} orders`}
                />
                {hour % 3 === 0 && (
                  <span className={styles.hourLabel}>{hour}h</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {ratings && ratings.count > 0 && (
        <div className={styles.reportSection}>
          <h3 className={styles.reportSectionTitle}>Customer Ratings</h3>
          <div className={styles.ratingSummary}>
            <div className={styles.ratingBig}>{ratings.average.toFixed(1)}</div>
            <div className={styles.ratingStarsRow}>
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={16} className={s <= Math.round(ratings.average) ? styles.starFilled : styles.starEmpty} fill={s <= Math.round(ratings.average) ? 'currentColor' : 'none'} />
              ))}
            </div>
            <div className={styles.ratingCount}>{ratings.count} review{ratings.count !== 1 ? 's' : ''}</div>
          </div>
          {ratings.recent.filter(r => r.comment).slice(0, 10).map(r => (
            <div key={r.id} className={styles.ratingComment}>
              <div className={styles.ratingCommentMeta}>
                <span className={styles.ratingCommentStars}>
                  {[1,2,3,4,5].map(s => <Star key={s} size={11} fill={s <= r.rating ? 'currentColor' : 'none'} />)}
                </span>
                <span className={styles.ratingCommentTable}>{formatTableLabel(r.tableId)}</span>
                <span className={styles.ratingCommentDate}>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <p className={styles.ratingCommentText}>{r.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function extractYouTubeId(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  return (
    raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1] ||
    raw.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ||
    raw.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)?.[1] ||
    raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] ||
    ''
  );
}

function MenuAvailabilityList({ items, togglingId, selected, bulkLoading, onToggle, onEdit, onDelete, onSelect, onBulkAction, onMediaChange }: {
  items: AdminMenuItem[];
  togglingId: number | null;
  selected: Set<number>;
  bulkLoading: boolean;
  onToggle: (item: AdminMenuItem) => void;
  onEdit: (item: AdminMenuItem) => void;
  onDelete: (item: AdminMenuItem) => void;
  onSelect: (id: number) => void;
  onBulkAction: (action: 'hide' | 'show' | 'delete') => void;
  onMediaChange: (id: number, patch: Partial<AdminMenuItem>) => Promise<void>;
}) {
  if (items.length === 0) return (
    <div className={styles.emptyState}>
      <UtensilsCrossed size={40} className={styles.emptyIcon} />
      <p>No menu items found. Menu may not be loaded from database yet.</p>
    </div>
  );

  const byCategory = items.reduce<Record<string, AdminMenuItem[]>>((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const soldOutCount = items.filter(i => !i.available).length;

  return (
    <div>
      <div className={styles.menuStatsBar}>
        <span>{items.length} items total</span>
        {soldOutCount > 0 && (
          <span className={styles.soldOutCount}>{soldOutCount} sold out</span>
        )}
      </div>

      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selected.size} selected</span>
          <button className={styles.bulkBtn} onClick={() => onBulkAction('show')} disabled={bulkLoading}>Show</button>
          <button className={styles.bulkBtn} onClick={() => onBulkAction('hide')} disabled={bulkLoading}>Hide</button>
          <button className={`${styles.bulkBtn} ${styles.bulkDeleteBtn}`} onClick={() => onBulkAction('delete')} disabled={bulkLoading}>
            {bulkLoading ? <Spinner size={11} /> : 'Delete'}
          </button>
        </div>
      )}

      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat} className={styles.menuCategory}>
          <div className={styles.menuCatHeader}>{cat}</div>
          <div className={styles.menuItemList}>
            {catItems.map(item => (
              <div key={item.dbId} className={`${styles.menuItemRow} ${!item.available ? styles.menuItemUnavailable : ''} ${selected.has(item.dbId) ? styles.menuItemSelected : ''}`}>
                <div className={styles.menuItemMain}>
                <input
                  type="checkbox"
                  className={styles.menuItemCheck}
                  checked={selected.has(item.dbId)}
                  onChange={() => onSelect(item.dbId)}
                  aria-label={`Select ${item.name}`}
                />
                <div className={styles.menuItemInfo}>
                  <span className={styles.menuItemName}>{item.name}</span>
                  <span className={styles.menuItemPrice}>{formatPrice(item.price)}</span>
                </div>
                <button
                  className={`${styles.availToggle} ${item.available ? styles.availOn : styles.availOff}`}
                  onClick={() => onToggle(item)}
                  disabled={togglingId === item.dbId}
                  aria-label={item.available ? `Mark ${item.name} as sold out` : `Mark ${item.name} as available`}
                >
                  {togglingId === item.dbId ? <Spinner size={12} /> : item.available ? 'Available' : 'Sold Out'}
                </button>
                <button
                  className={styles.itemEditBtn}
                  onClick={() => onEdit(item)}
                  aria-label={`Edit ${item.name}`}
                  title="Edit item"
                >
                  <Pencil size={12} />
                </button>
                <button
                  className={styles.itemDeleteBtn}
                  onClick={() => onDelete(item)}
                  aria-label={`Delete ${item.name}`}
                  title="Delete item"
                >
                  <Trash2 size={12} />
                </button>
                </div>
                <MenuItemMediaControls item={item} onMediaChange={onMediaChange} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MenuItemMediaControls({ item, onMediaChange }: {
  item: AdminMenuItem;
  onMediaChange: (id: number, patch: Partial<AdminMenuItem>) => Promise<void>;
}) {
  const [youtubeValue, setYoutubeValue] = useState(item.youtubeId || '');
  const [busy, setBusy] = useState<'image' | 'video' | 'youtube' | 'clear' | null>(null);

  useEffect(() => { setYoutubeValue(item.youtubeId || ''); }, [item.youtubeId]);

  async function uploadMedia(file: File, kind: 'image' | 'video') {
    setBusy(kind);
    try {
      const form = new FormData();
      form.append('mediaFile', file);
      const result = await api.uploadFile(form);
      const patch: Partial<AdminMenuItem> = result.type.startsWith('video/')
        ? { video: result.filePath, videoVisible: true }
        : { img: result.filePath, imageVisible: true };
      await onMediaChange(item.dbId, patch);
    } catch {
      alert('Upload failed. Please try a JPG, PNG, WebP, MP4, or WebM file.');
    } finally {
      setBusy(null);
    }
  }

  async function saveYoutube() {
    const youtubeId = extractYouTubeId(youtubeValue);
    if (youtubeValue.trim() && !youtubeId) {
      alert('Please enter a valid YouTube URL or 11-character video ID.');
      return;
    }
    setBusy('youtube');
    try {
      await onMediaChange(item.dbId, { youtubeId, videoVisible: true });
      setYoutubeValue(youtubeId);
    } catch {
      alert('Could not save YouTube reference.');
    } finally {
      setBusy(null);
    }
  }

  async function clearVideo() {
    setBusy('clear');
    try {
      await onMediaChange(item.dbId, { video: '', youtubeId: '' });
      setYoutubeValue('');
    } catch {
      alert('Could not clear video.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className={styles.mediaDetails}>
      <summary className={styles.mediaSummary}>
        <span className={styles.mediaSummaryText}>Media</span>
        <span className={styles.mediaBadges}>
          {item.img && <span className={styles.mediaMiniBadge}><ImageIcon size={11} /> Image</span>}
          {(item.video || item.youtubeId) && <span className={styles.mediaMiniBadge}><Film size={11} /> Video</span>}
        </span>
      </summary>
      <div className={styles.mediaControls}>
        <label className={styles.mediaUploadBtn}>
          {busy === 'image' ? <Spinner size={12} /> : <ImageIcon size={13} />}
          Upload image
          <input
            className={styles.mediaFileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) uploadMedia(file, 'image');
            }}
          />
        </label>
        <label className={styles.mediaUploadBtn}>
          {busy === 'video' ? <Spinner size={12} /> : <Upload size={13} />}
          Upload video
          <input
            className={styles.mediaFileInput}
            type="file"
            accept="video/mp4,video/webm"
            onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) uploadMedia(file, 'video');
            }}
          />
        </label>
        <div className={styles.youtubeRow}>
          <Link2 size={13} className={styles.youtubeIcon} />
          <input
            className={styles.youtubeInput}
            value={youtubeValue}
            onChange={event => setYoutubeValue(event.target.value)}
            placeholder="YouTube URL or ID"
            aria-label={`YouTube video for ${item.name}`}
          />
          <button className={styles.youtubeSaveBtn} onClick={saveYoutube} disabled={busy !== null}>
            {busy === 'youtube' ? <Spinner size={12} /> : 'Save'}
          </button>
          {(item.video || item.youtubeId) && (
            <button className={styles.mediaClearBtn} onClick={clearVideo} disabled={busy !== null} aria-label={`Clear video for ${item.name}`}>
              {busy === 'clear' ? <Spinner size={12} /> : 'Clear'}
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

const DISCOUNT_PRESETS = [10, 15, 20, 25];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function TablesPanel({ tableCarts, onApplyOverride }: {
  tableCarts: TableCartEntry[];
  onApplyOverride: (tableId: string, overrides: unknown[]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [customPct, setCustomPct] = useState('');
  const [compItems, setCompItems] = useState<Set<string>>(new Set());

  const table = tableCarts.find(t => t.tableId === selected);

  function handleSelectTable(tableId: string) {
    setSelected(tableId === selected ? null : tableId);
    setDiscountPct(0);
    setCustomPct('');
    setCompItems(new Set());
  }

  function buildOverrides() {
    const pct = customPct ? Number(customPct) : discountPct;
    const overrides: unknown[] = [];
    if (pct > 0) overrides.push({ type: 'discount_pct', value: pct });
    if (compItems.size > 0) overrides.push({ type: 'comp_items', names: Array.from(compItems) });
    return overrides;
  }

  return (
    <div>
      <div className={styles.tablesGrid}>
        {tableCarts.map(t => (
          <div
            key={t.tableId}
            className={`${styles.tableCardAdmin} ${t.tableId === selected ? styles.tableCardSelected : ''} ${t.itemCount > 0 ? styles.tableCardActive : ''}`}
            onClick={() => handleSelectTable(t.tableId)}
          >
            <div className={styles.tableCardName}>{t.tableId.replace(/^table/, 'Table ')}</div>
            {t.itemCount > 0 ? (
              <>
                <div className={styles.tableCardCount}>{t.itemCount} item{t.itemCount !== 1 ? 's' : ''}</div>
                <div className={styles.tableCardTotal}>{formatPrice(t.total)}</div>
              </>
            ) : (
              <div className={styles.tableCardEmpty}>Empty</div>
            )}
          </div>
        ))}
      </div>

      {selected && table && table.cart.length > 0 && (
        <div className={styles.tableOverridePanel}>
          <h3 className={styles.overrideTitle}>{selected.replace(/^table/, 'Table ')} — Override</h3>

          <div className={styles.overrideSection}>
            <div className={styles.overrideSectionTitle}>Discount</div>
            <div className={styles.discountPresets}>
              {DISCOUNT_PRESETS.map(p => (
                <button
                  key={p}
                  className={`${styles.discountPresetBtn} ${discountPct === p && !customPct ? styles.discountPresetActive : ''}`}
                  onClick={() => { setDiscountPct(p); setCustomPct(''); }}
                >
                  {p}%
                </button>
              ))}
              <input
                type="number"
                className={styles.customDiscountInput}
                placeholder="Custom %"
                min={0}
                max={100}
                value={customPct}
                onChange={e => { setCustomPct(e.target.value); setDiscountPct(0); }}
              />
            </div>
          </div>

          <div className={styles.overrideSection}>
            <div className={styles.overrideSectionTitle}>Comp Items (free)</div>
            <div className={styles.compItemsList}>
              {table.cart.map((item, i) => {
                const key = `${item.name}:${i}`;
                return (
                  <label key={key} className={styles.compItemRow}>
                    <input
                      type="checkbox"
                      checked={compItems.has(key)}
                      onChange={() => {
                        setCompItems(prev => {
                          const s = new Set(prev);
                          if (s.has(key)) s.delete(key); else s.add(key);
                          return s;
                        });
                      }}
                    />
                    <span>{item.name}</span>
                    <span className={styles.compItemPrice}>{formatPrice(item.price)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className={styles.overrideActions}>
            <button
              className={styles.applyOverrideBtn}
              onClick={() => { onApplyOverride(selected, buildOverrides()); }}
            >
              Apply Override
            </button>
            <button
              className={styles.clearOverrideBtn}
              onClick={() => { onApplyOverride(selected, []); setDiscountPct(0); setCustomPct(''); setCompItems(new Set()); }}
            >
              Clear Discounts
            </button>
          </div>
        </div>
      )}

      {selected && table && table.cart.length === 0 && (
        <div className={styles.emptyState}><p>No items in cart for {selected.replace(/^table/, 'Table ')}.</p></div>
      )}
    </div>
  );
}

// ── Chef recommendations management (owner controls — Phase 3, Task 8) ──
const CHEF_REC_SEASONS = ['ALL_YEAR', 'SUMMER', 'WINTER', 'SPRING', 'AUTUMN', 'FESTIVE'];
const CHEF_REC_TYPES: ChefRecType[] = ['DISH', 'SIDE', 'DESSERT', 'BEVERAGE'];
const CHEF_BEVERAGE_KINDS: ChefBeverageKind[] = ['NONE', 'WINE', 'COCKTAIL', 'BEER', 'SOFT', 'HOT'];
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const chefField: CSSProperties = {
  width: '100%', padding: '9px 11px', background: 'rgba(0,0,0,0.35)',
  border: '1px solid var(--color-line, rgba(var(--color-gold-rgb),0.22))', borderRadius: 8,
  color: 'var(--color-cream, #f3ead6)', fontSize: 13, outline: 'none'
};
const chefLabel: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--color-sand, #b8a88a)', margin: '0 0 5px'
};

function ChefRecsPanel({ recs, menuItems, onCreate, onUpdate, onDelete }: {
  recs: ChefRec[];
  menuItems: AdminMenuItem[];
  onCreate: (input: ChefRecInput) => Promise<string | null>;
  onUpdate: (id: number, patch: Partial<ChefRecInput>) => void;
  onDelete: (id: number) => void;
}) {
  const [sourceItemId, setSourceItemId] = useState(0);
  const [targetItemId, setTargetItemId] = useState(0);
  const [recType, setRecType] = useState<ChefRecType>('DISH');
  const [beverageKind, setBeverageKind] = useState<ChefBeverageKind>('NONE');
  const [priority, setPriority] = useState(100);
  const [season, setSeason] = useState('ALL_YEAR');
  const [rotationGroup, setRotationGroup] = useState('');
  const [reason, setReason] = useState('');
  const [active, setActive] = useState(true);
  const [status, setStatus] = useState<{ msg: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const sortedItems = [...menuItems].filter(i => i.dbId).sort((a, b) => a.name.localeCompare(b.name));

  function onTypeChange(t: ChefRecType) {
    setRecType(t);
    if (t === 'BEVERAGE') { if (beverageKind === 'NONE') setBeverageKind('WINE'); }
    else setBeverageKind('NONE');
  }

  async function submit() {
    if (!sourceItemId || !targetItemId) { setStatus({ msg: 'Select both a source and a target item.', error: true }); return; }
    if (sourceItemId === targetItemId) { setStatus({ msg: 'Source and target must be different items.', error: true }); return; }
    setSaving(true);
    const err = await onCreate({ sourceItemId, targetItemId, recType, beverageKind, priority, season, rotationGroup: rotationGroup.trim(), reason: reason.trim(), active });
    setSaving(false);
    if (err) setStatus({ msg: err, error: true });
    else { setStatus({ msg: 'Chef recommendation added.', error: false }); setReason(''); setRotationGroup(''); }
  }

  const groups = new Map<string, ChefRec[]>();
  recs.forEach(r => { const arr = groups.get(r.sourceName) || []; arr.push(r); groups.set(r.sourceName, arr); });
  const groupNames = [...groups.keys()].sort();

  return (
    <div>
      <p style={{ color: 'var(--color-sand, #b8a88a)', fontSize: 13, lineHeight: 1.55, maxWidth: 720, marginBottom: 18 }}>
        Chef recommendations <strong style={{ color: 'var(--color-gold)' }}>always win</strong> — they show ahead of
        every automatic suggestion across the guest app, chatbot, item pairings and the waiter upsell screen. Put several
        beverages in one rotation group and the engine rotates between them for different guests. Category-safety rules
        (one beverage, never wine + cocktail, no dessert → starter) still apply.
      </p>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-line, rgba(var(--color-gold-rgb),0.18))', borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, color: 'var(--color-cream, #f3ead6)' }}>Add chef recommendation</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={chefLabel}>When the guest has…</label>
            <select style={chefField} value={sourceItemId} onChange={e => setSourceItemId(Number(e.target.value))}>
              <option value={0}>— select source item —</option>
              {sortedItems.map(it => <option key={it.dbId} value={it.dbId}>{it.name}</option>)}
            </select>
          </div>
          <div>
            <label style={chefLabel}>…recommend</label>
            <select style={chefField} value={targetItemId} onChange={e => setTargetItemId(Number(e.target.value))}>
              <option value={0}>— select target item —</option>
              {sortedItems.map(it => <option key={it.dbId} value={it.dbId}>{it.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <label style={chefLabel}>Type</label>
            <select style={chefField} value={recType} onChange={e => onTypeChange(e.target.value as ChefRecType)}>
              {CHEF_REC_TYPES.map(t => <option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
          </div>
          <div>
            <label style={chefLabel}>Beverage kind</label>
            <select style={chefField} value={beverageKind} disabled={recType !== 'BEVERAGE'} onChange={e => setBeverageKind(e.target.value as ChefBeverageKind)}>
              {CHEF_BEVERAGE_KINDS.map(k => <option key={k} value={k}>{k === 'NONE' ? '— (food)' : titleCase(k)}</option>)}
            </select>
          </div>
          <div>
            <label style={chefLabel}>Priority</label>
            <input type="number" style={chefField} value={priority} min={0} max={1000} onChange={e => setPriority(Number(e.target.value))} />
          </div>
          <div>
            <label style={chefLabel}>Season</label>
            <select style={chefField} value={season} onChange={e => setSeason(e.target.value)}>
              {CHEF_REC_SEASONS.map(s => <option key={s} value={s}>{s === 'ALL_YEAR' ? 'All year' : titleCase(s)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={chefLabel}>Rotation group (optional)</label>
          <input type="text" style={chefField} placeholder="e.g. ribeye-reds — share across beverages to rotate them" value={rotationGroup} onChange={e => setRotationGroup(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={chefLabel}>Reason (shown to guests on the card)</label>
          <input type="text" style={chefField} placeholder="e.g. Bold red — built to stand up to grilled beef." value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-cream, #f3ead6)', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
          </label>
          <button className={styles.actionBtnGold} onClick={submit} disabled={saving}>
            {saving ? <Spinner size={13} /> : <Plus size={14} />} Add recommendation
          </button>
          {status && <span style={{ fontSize: 13, color: status.error ? '#fca5a5' : '#5fcf8a' }}>{status.msg}</span>}
        </div>
      </div>

      {recs.length === 0 ? (
        <div className={styles.emptyState}>
          <Sparkles size={40} className={styles.emptyIcon} />
          <p>No chef recommendations yet. Add one above — it takes priority over automatic suggestions.</p>
        </div>
      ) : (
        groupNames.map(name => (
          <div key={name} style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 14, color: 'var(--color-cream, #f3ead6)', margin: '0 0 8px' }}>
              With <span style={{ color: 'var(--color-gold)' }}>{name}</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.get(name)!.map(r => (
                <ChefRecRow key={r.id} rec={r} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ChefRecRow({ rec, onUpdate, onDelete }: {
  rec: ChefRec;
  onUpdate: (id: number, patch: Partial<ChefRecInput>) => void;
  onDelete: (id: number) => void;
}) {
  const [reason, setReason] = useState(rec.reason);
  const [rotationGroup, setRotationGroup] = useState(rec.rotationGroup);
  const [priority, setPriority] = useState(rec.priority);

  const kindLabel = rec.recType === 'BEVERAGE' ? `${rec.recType} · ${rec.beverageKind}` : rec.recType;

  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--color-line, rgba(var(--color-gold-rgb),0.14))', borderRadius: 10, padding: '12px 14px', opacity: rec.active ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <strong style={{ color: 'var(--color-cream, #f3ead6)' }}>→ {rec.targetName}</strong>
          <span style={{ color: 'var(--color-sand, #b8a88a)', fontSize: 12, marginLeft: 8 }}>
            {kindLabel}{rec.season && rec.season !== 'ALL_YEAR' ? ` · ${rec.season}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--color-cream, #f3ead6)', cursor: 'pointer' }}>
            <input type="checkbox" checked={rec.active} onChange={e => onUpdate(rec.id, { active: e.target.checked })} />
            {rec.active ? 'Active' : 'Disabled'}
          </label>
          <button onClick={() => onDelete(rec.id)} aria-label="Delete recommendation"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 88px', gap: 8 }}>
        <input style={chefField} value={reason} placeholder="Reason shown to guests"
          onChange={e => setReason(e.target.value)} onBlur={() => { if (reason !== rec.reason) onUpdate(rec.id, { reason }); }} />
        <input style={chefField} value={rotationGroup} placeholder="Rotation group"
          onChange={e => setRotationGroup(e.target.value)} onBlur={() => { if (rotationGroup !== rec.rotationGroup) onUpdate(rec.id, { rotationGroup }); }} />
        <input style={chefField} type="number" value={priority}
          onChange={e => setPriority(Number(e.target.value))} onBlur={() => { if (priority !== rec.priority) onUpdate(rec.id, { priority }); }} />
      </div>
    </div>
  );
}

// ── Recommendation analytics dashboard (Phase 4, Task 2) ──
const RECO_RANGES: { key: ReportRange; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: '7d', label: '7 Days' }, { key: '30d', label: '30 Days' }, { key: 'all', label: 'All' }
];
const RECO_CATEGORIES = ['', 'DISH', 'SIDE', 'DESSERT', 'BEVERAGE', 'STARTER', 'MAIN', 'WINE', 'DRINK'];
const pctLabel = (r: number) => `${((Number(r) || 0) * 100).toFixed(1)}%`;

type RecoFilters = { range: ReportRange; category: string; source: string; rotationGroup: string; mode: string };

function RecoKpi({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryValue}>{value}</div>
      <div className={styles.summaryLabel}>{label}</div>
      {sub ? <div className={styles.summaryLabel} style={{ opacity: 0.65 }}>{sub}</div> : null}
    </div>
  );
}

function RecoBoard({ title, rows, metric }: { title: string; rows: RecoTally[]; metric: (r: RecoTally) => string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className={styles.reportSection}>
      <h3 className={styles.reportSectionTitle}>{title}</h3>
      <div className={styles.topItemsList}>
        {rows.map((r, i) => (
          <div key={`${r.name || r.source || r.rotationGroup || 'row'}-${i}`} className={styles.topItemRow}>
            <span className={styles.topItemRank}>#{i + 1}</span>
            <span className={styles.topItemName}>{r.name || r.source || r.rotationGroup || '—'}{r.chef ? <Star size={11} fill="currentColor" className={styles.specialStar} /> : ''}</span>
            <span className={styles.topItemQty}>{r.impressions} shown</span>
            <span className={styles.topItemRev}>{metric(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_COLOR: Record<string, string> = { high: '#fca5a5', medium: '#e6c06b', low: '#9aa6b2' };

function RecoActionItems({ insights }: { insights: RecoInsight[] }) {
  if (!insights || insights.length === 0) return null;
  return (
    <div className={styles.reportSection} style={{ marginBottom: 18 }}>
      <h3 className={styles.reportSectionTitle}>Action items ({insights.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.slice(0, 12).map((ins, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--color-line, rgba(var(--color-gold-rgb),0.14))', borderLeft: `3px solid ${SEVERITY_COLOR[ins.severity] || '#9aa6b2'}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SEVERITY_COLOR[ins.severity] || '#9aa6b2' }}>{ins.severity}</span>
              <strong style={{ color: 'var(--color-cream, #f3ead6)', fontSize: 13 }}>{ins.title}</strong>
            </div>
            <div style={{ color: 'var(--color-sand, #b8a88a)', fontSize: 12, marginTop: 3 }}>{ins.detail}</div>
            <div style={{ color: 'var(--color-gold)', fontSize: 12, marginTop: 4 }}>→ {ins.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecoAnalyticsPanel({ data, insights, filters, onFilterChange }: {
  data: RecommendationAnalytics | null;
  insights: RecoInsightsResult | null;
  filters: RecoFilters;
  onFilterChange: (next: RecoFilters) => void;
}) {
  const totals = data?.totals;
  const set = (patch: Partial<RecoFilters>) => onFilterChange({ ...filters, ...patch });
  const sources = (data?.bySource || []).map(s => s.source).filter(Boolean) as string[];
  const groups = (data?.byRotationGroup || []).map(g => g.rotationGroup).filter(Boolean) as string[];

  return (
    <div className={styles.reportsPanel}>
      <div className={styles.rangeBar}>
        {RECO_RANGES.map(r => (
          <button key={r.key} className={`${styles.rangeBtn} ${filters.range === r.key ? styles.rangeBtnActive : ''}`} onClick={() => set({ range: r.key })}>{r.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 18px' }}>
        <select style={{ ...chefField, width: 'auto' }} value={filters.mode} onChange={e => set({ mode: e.target.value })}>
          <option value="">All modes</option>
          <option value="customer">Customer</option>
          <option value="waiter">Waiter</option>
        </select>
        <select style={{ ...chefField, width: 'auto' }} value={filters.category} onChange={e => set({ category: e.target.value })}>
          {RECO_CATEGORIES.map(c => <option key={c} value={c}>{c ? titleCase(c) : 'All categories'}</option>)}
        </select>
        <select style={{ ...chefField, width: 'auto' }} value={filters.source} onChange={e => set({ source: e.target.value })}>
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...chefField, width: 'auto' }} value={filters.rotationGroup} onChange={e => set({ rotationGroup: e.target.value })}>
          <option value="">All rotation groups</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <RecoActionItems insights={insights?.insights || []} />

      {!totals || totals.impressions === 0 ? (
        <div className={styles.emptyState}>
          <TrendingUp size={40} className={styles.emptyIcon} />
          <p>No recommendation events for this filter yet. Events stream in as guests and waiters see, click and accept recommendations.</p>
        </div>
      ) : (
        <>
          <div className={styles.summaryCards}>
            <RecoKpi value={String(totals.impressions)} label="Impressions" />
            <RecoKpi value={String(totals.clicks)} label="Clicks" sub={`${pctLabel(totals.clickRate)} CTR`} />
            <RecoKpi value={String(totals.accepted)} label="Accepted" />
            <RecoKpi value={pctLabel(totals.acceptanceRate)} label="Acceptance rate" />
            <RecoKpi value={pctLabel(totals.dismissalRate)} label="Dismissal rate" />
            <RecoKpi value={String(totals.ordered)} label="Orders generated" />
            <RecoKpi value={formatPrice(totals.revenue)} label="Revenue attributed" sub={`${formatPrice(totals.revenuePerImpression || 0)} / impression`} />
          </div>

          <div className={styles.reportsGrid}>
            <RecoBoard title="Most shown" rows={data!.topShown} metric={r => `${r.impressions}×`} />
            <RecoBoard title="Most clicked" rows={data!.topClicked} metric={r => `${r.clicks} clicks`} />
            <RecoBoard title="Highest conversion" rows={data!.topConverting} metric={r => pctLabel(r.acceptanceRate)} />
            <RecoBoard title="Underperforming (shown, rarely taken)" rows={data!.underperforming || []} metric={r => pctLabel(r.acceptanceRate)} />
            <RecoBoard title="Revenue attributed" rows={(data!.topRevenue || []).filter(r => r.revenue > 0)} metric={r => formatPrice(r.revenue)} />
          </div>

          <RecoBoard title="By source" rows={data!.bySource} metric={r => `${pctLabel(r.acceptanceRate)} acc.`} />
          <RecoBoard title="By bundle (persona)" rows={data!.byBundle || []} metric={r => `${pctLabel(r.acceptanceRate)} acc.`} />
          <RecoBoard title="By rotation group" rows={data!.byRotationGroup} metric={r => `${pctLabel(r.acceptanceRate)} acc.`} />
        </>
      )}
    </div>
  );
}

// ── Recommended-order bundle management (Phase 5, Task 1) ──
const BUNDLE_COURSES = ['Drink', 'Starter', 'Main', 'Dessert', 'Side', 'Extra'];
const iconBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 8, cursor: 'pointer' };

function BundleItemsEditor({ items, onChange }: { items: BundleItemInput[]; onChange: (items: BundleItemInput[]) => void }) {
  const update = (i: number, patch: Partial<BundleItemInput>) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 36px', gap: 6 }}>
          <select style={chefField} value={it.course} onChange={e => update(i, { course: e.target.value })}>
            {BUNDLE_COURSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input style={chefField} placeholder="Item name" value={it.itemName} onChange={e => update(i, { itemName: e.target.value })} />
          <input style={chefField} type="number" placeholder="Price" value={it.price} onChange={e => update(i, { price: Number(e.target.value) || 0 })} />
          <button style={iconBtn} aria-label="Remove course" onClick={() => onChange(items.filter((_, idx) => idx !== i))}><Trash2 size={12} /></button>
        </div>
      ))}
      <button className={styles.actionBtn} style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, { course: 'Main', itemName: '', price: 0 }])}>
        <Plus size={13} /> Add course
      </button>
    </div>
  );
}

function BundleRow({ bundle, onUpdate, onDelete }: {
  bundle: BundleAdmin;
  onUpdate: (id: number, patch: Partial<BundleInput>) => void;
  onDelete: (id: number) => void;
}) {
  const [items, setItems] = useState<BundleItemInput[]>(bundle.items || []);
  const [priority, setPriority] = useState(bundle.priority);
  const [rotationGroup, setRotationGroup] = useState(bundle.rotationGroup || '');
  const dirty = JSON.stringify(items) !== JSON.stringify(bundle.items || []);

  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--color-line, rgba(var(--color-gold-rgb),0.14))', borderRadius: 10, padding: '12px 14px', marginBottom: 12, opacity: bundle.active ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ color: 'var(--color-cream, #f3ead6)' }}>{bundle.icon} {bundle.persona}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--color-cream, #f3ead6)', cursor: 'pointer' }}>
            <input type="checkbox" checked={bundle.active} onChange={e => onUpdate(bundle.id, { active: e.target.checked })} />
            {bundle.active ? 'Active' : 'Disabled'}
          </label>
          <button style={iconBtn} aria-label="Delete bundle" onClick={() => onDelete(bundle.id)}><Trash2 size={12} /> Delete</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div><label style={chefLabel}>Priority</label><input style={{ ...chefField, width: 90 }} type="number" value={priority} onChange={e => setPriority(Number(e.target.value) || 0)} onBlur={() => { if (priority !== bundle.priority) onUpdate(bundle.id, { priority }); }} /></div>
        <div><label style={chefLabel}>Rotation group</label><input style={{ ...chefField, width: 160 }} value={rotationGroup} onChange={e => setRotationGroup(e.target.value)} onBlur={() => { if (rotationGroup !== (bundle.rotationGroup || '')) onUpdate(bundle.id, { rotationGroup }); }} /></div>
      </div>
      <BundleItemsEditor items={items} onChange={setItems} />
      {dirty && (
        <button className={styles.actionBtnGold} style={{ marginTop: 10 }} onClick={() => onUpdate(bundle.id, { items: items.filter(it => it.itemName.trim()) })}>Save courses</button>
      )}
    </div>
  );
}

function BundlesPanel({ bundles, onCreate, onUpdate, onDelete }: {
  bundles: BundleAdmin[];
  onCreate: (input: BundleInput) => Promise<string | null>;
  onUpdate: (id: number, patch: Partial<BundleInput>) => void;
  onDelete: (id: number) => void;
}) {
  const [persona, setPersona] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🍽️');
  const [accent, setAccent] = useState('#a8812c');
  const [priority, setPriority] = useState(100);
  const [rotationGroup, setRotationGroup] = useState('');
  const [items, setItems] = useState<BundleItemInput[]>([{ course: 'Drink', itemName: '', price: 0 }, { course: 'Main', itemName: '', price: 0 }]);
  const [status, setStatus] = useState<{ msg: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!persona.trim()) { setStatus({ msg: 'Persona name is required.', error: true }); return; }
    const cleanItems = items.filter(it => it.itemName.trim());
    if (cleanItems.length === 0) { setStatus({ msg: 'Add at least one item.', error: true }); return; }
    setSaving(true);
    const err = await onCreate({ persona: persona.trim(), description, icon, accent, priority, rotationGroup, items: cleanItems });
    setSaving(false);
    if (err) { setStatus({ msg: err, error: true }); return; }
    setStatus({ msg: 'Bundle created.', error: false });
    setPersona(''); setDescription(''); setRotationGroup('');
    setItems([{ course: 'Drink', itemName: '', price: 0 }, { course: 'Main', itemName: '', price: 0 }]);
  }

  return (
    <div>
      <p style={{ color: 'var(--color-sand, #b8a88a)', fontSize: 13, lineHeight: 1.55, maxWidth: 720, marginBottom: 18 }}>
        Persona bundles power the guest menu's <strong>"Not sure what to order?"</strong> strip. Each is a curated full
        meal (drink, starter, main, dessert). Disable one to hide it; priority orders the strip. The guest app falls back
        to a built-in set only if the database is unavailable.
      </p>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-line, rgba(var(--color-gold-rgb),0.18))', borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, color: 'var(--color-cream, #f3ead6)' }}>Add bundle</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div><label style={chefLabel}>Persona</label><input style={chefField} placeholder="The Steak Lover" value={persona} onChange={e => setPersona(e.target.value)} /></div>
          <div><label style={chefLabel}>Icon</label><input style={chefField} value={icon} onChange={e => setIcon(e.target.value)} /></div>
          <div><label style={chefLabel}>Accent (hex)</label><input style={chefField} value={accent} onChange={e => setAccent(e.target.value)} /></div>
          <div><label style={chefLabel}>Priority</label><input style={chefField} type="number" value={priority} onChange={e => setPriority(Number(e.target.value) || 0)} /></div>
          <div><label style={chefLabel}>Rotation group</label><input style={chefField} value={rotationGroup} onChange={e => setRotationGroup(e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 12 }}><label style={chefLabel}>Description</label><input style={chefField} placeholder="Flame-grilled, dry-aged, unapologetic." value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div style={{ marginTop: 12 }}><label style={chefLabel}>Courses & items</label><BundleItemsEditor items={items} onChange={setItems} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <button className={styles.actionBtnGold} onClick={submit} disabled={saving}>{saving ? <Spinner size={13} /> : <Plus size={14} />} Add bundle</button>
          {status && <span style={{ fontSize: 13, color: status.error ? '#fca5a5' : '#5fcf8a' }}>{status.msg}</span>}
        </div>
      </div>

      {bundles.length === 0 ? (
        <div className={styles.emptyState}>
          <LayoutGrid size={40} className={styles.emptyIcon} />
          <p>No bundles in the database. The guest menu is using the built-in fallback set — add bundles here (or run <code>npm run bundles:seed -- --apply</code>) to manage them.</p>
        </div>
      ) : (
        bundles.map(b => <BundleRow key={b.id} bundle={b} onUpdate={onUpdate} onDelete={onDelete} />)
      )}
    </div>
  );
}

function DealsPanel({ deals, onSave }: { deals: Deal[]; onSave: (d: Deal[]) => void }) {
  const [local, setLocal] = useState<Deal[]>(deals);
  useEffect(() => { setLocal(deals); }, [deals]);

  function update(i: number, patch: Partial<Deal>) {
    setLocal(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  }

  function toggleDay(i: number, day: number) {
    const activeDays = local[i].activeDays || [0, 1, 2, 3, 4, 5, 6];
    const next = activeDays.includes(day) ? activeDays.filter(d => d !== day) : [...activeDays, day].sort();
    update(i, { activeDays: next });
  }

  return (
    <div className={styles.dealsPanel}>
      {local.length === 0 && <div className={styles.emptyState}><p>No deals configured.</p></div>}
      {local.map((deal, i) => (
        <div key={i} className={styles.dealCard}>
          <div className={styles.dealItemList}>
            {deal.items.map((item, j) => (
              <span key={j} className={styles.dealItemChip}>{item.name}</span>
            ))}
          </div>
          <div className={styles.dealPrice}>Bundle price: {formatPrice(deal.price)}</div>

          <div className={styles.dealSchedule}>
            <div className={styles.dealScheduleRow}>
              <label className={styles.dealLabel}>Active from</label>
              <input
                type="time"
                className={styles.dealTimeInput}
                value={deal.startsAt || ''}
                onChange={e => update(i, { startsAt: e.target.value || undefined })}
              />
              <label className={styles.dealLabel}>to</label>
              <input
                type="time"
                className={styles.dealTimeInput}
                value={deal.endsAt || ''}
                onChange={e => update(i, { endsAt: e.target.value || undefined })}
              />
              {(deal.startsAt || deal.endsAt) && (
                <button className={styles.dealClearTime} onClick={() => update(i, { startsAt: undefined, endsAt: undefined })}>
                  Always on
                </button>
              )}
            </div>
            <div className={styles.dealDays}>
              {DAYS.map((d, day) => {
                const activeDays = local[i].activeDays;
                const active = !activeDays || activeDays.includes(day);
                return (
                  <button
                    key={day}
                    className={`${styles.dealDayBtn} ${active ? styles.dealDayActive : ''}`}
                    onClick={() => toggleDay(i, day)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      {local.length > 0 && (
        <button className={styles.saveDealBtn} onClick={() => onSave(local)}>
          Save Schedule
        </button>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, footer, wide = false }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalCard} ${wide ? styles.modalWide : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <h3 className={styles.modalTitle}>{title}</h3>
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer && <div className={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

// Create AND edit a menu item. In edit mode the form is prefilled from `item` and
// submission PATCHes the existing row (preserving its id / chef-rec links); in create
// mode it POSTs a new item. One form, no duplicated validation. Media is managed
// separately in the menu list (MenuItemMediaControls).
function NewItemModal({ categories, item, onClose, onSubmit }: {
  categories: string[];
  item?: AdminMenuItem | null;
  onClose: () => void;
  onSubmit: (payload: ItemFormPayload) => Promise<void>;
}) {
  const isEdit = !!item;
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || '');
  const [price, setPrice] = useState(item ? String(item.price ?? '') : '');
  const [description, setDescription] = useState(item?.description || '');
  const [calories, setCalories] = useState(item?.calories || '');
  const [allergens, setAllergens] = useState(item?.allergens || '');
  const [spice, setSpice] = useState(item?.spice || '');
  const [available, setAvailable] = useState(item ? item.available !== false : true);
  const [chefPick, setChefPick] = useState(item ? !!item.chefPick : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim() || !category.trim()) { setError('Name and category are required.'); return; }
    setBusy(true); setError('');
    try {
      await onSubmit({
        name: name.trim(),
        category: category.trim(),
        price: Number(price) || 0,
        description: description.trim(),
        calories: calories.trim(),
        allergens: allergens.trim(),
        spice: spice.trim(),
        available,
        chefPick,
      });
    } catch { setError(isEdit ? 'Could not save the item.' : 'Could not create the item.'); setBusy(false); }
  }

  return (
    <Modal
      title={isEdit ? 'Edit menu item' : 'New menu item'}
      subtitle={isEdit ? 'Update this dish on the live menu' : 'Add a dish to the live menu'}
      onClose={onClose}
      footer={<>
        <button className={styles.modalCancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={styles.modalSubmit} onClick={submit} disabled={busy}>{busy ? <Spinner size={13} /> : (isEdit ? 'Save changes' : 'Create item')}</button>
      </>}
    >
      <label className={styles.formLabel}>Name
        <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dry-Aged Tomahawk" autoFocus />
      </label>
      <label className={styles.formLabel}>Category
        <input className={styles.formInput} list="admin-cat-list" value={category} onChange={e => setCategory(e.target.value)} placeholder="Pick or type a category" />
        <datalist id="admin-cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
      </label>
      <label className={styles.formLabel}>Price (R)
        <input className={styles.formInput} type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
      </label>
      <label className={styles.formLabel}>Description
        <textarea className={styles.formTextarea} value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional" />
      </label>
      <label className={styles.formLabel}>Calories
        <input className={styles.formInput} value={calories} onChange={e => setCalories(e.target.value)} placeholder="e.g. 850 kcal (optional)" />
      </label>
      <label className={styles.formLabel}>Allergens
        <input className={styles.formInput} value={allergens} onChange={e => setAllergens(e.target.value)} placeholder="e.g. gluten, dairy (optional)" />
      </label>
      <label className={styles.formLabel}>Spice level
        <input className={styles.formInput} value={spice} onChange={e => setSpice(e.target.value)} placeholder="e.g. 0–3 (optional)" />
      </label>
      <div className={styles.formToggles}>
        <label className={styles.formCheck}><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} /> Available now</label>
        <label className={styles.formCheck}><input type="checkbox" checked={chefPick} onChange={e => setChefPick(e.target.checked)} /> Chef's pick</label>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </Modal>
  );
}

function NewReservationModal({ defaultDate, onClose, onSubmit }: {
  defaultDate: string;
  onClose: () => void;
  onSubmit: (payload: { name: string; phone: string; partySize: number; date: string; notes: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('19:00');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim() || !date) { setError('Name and date are required.'); return; }
    setBusy(true); setError('');
    try {
      const iso = new Date(`${date}T${time || '19:00'}`).toISOString();
      await onSubmit({ name: name.trim(), phone: phone.trim(), partySize: Number(partySize) || 2, date: iso, notes: notes.trim() });
    } catch { setError('Could not create the booking.'); setBusy(false); }
  }

  return (
    <Modal
      title="New booking"
      subtitle="Add a reservation"
      onClose={onClose}
      footer={<>
        <button className={styles.modalCancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={styles.modalSubmit} onClick={submit} disabled={busy}>{busy ? <Spinner size={13} /> : 'Create booking'}</button>
      </>}
    >
      <label className={styles.formLabel}>Guest name
        <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus />
      </label>
      <label className={styles.formLabel}>Phone
        <input className={styles.formInput} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" />
      </label>
      <div className={styles.formGrid3}>
        <label className={styles.formLabel}>Party
          <input className={styles.formInput} type="number" min={1} value={partySize} onChange={e => setPartySize(e.target.value)} />
        </label>
        <label className={styles.formLabel}>Date
          <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className={styles.formLabel}>Time
          <input className={styles.formInput} type="time" value={time} onChange={e => setTime(e.target.value)} />
        </label>
      </div>
      <label className={styles.formLabel}>Notes
        <textarea className={styles.formTextarea} value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Allergies, occasion, seating…" />
      </label>
      {error && <p className={styles.formError}>{error}</p>}
    </Modal>
  );
}

function NewDealModal({ menuItems, onClose, onSubmit }: {
  menuItems: AdminMenuItem[];
  onClose: () => void;
  onSubmit: (deal: Deal) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<AdminMenuItem[]>([]);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const regular = picked.reduce((s, i) => s + (i.price || 0), 0);
  const results = search.trim()
    ? menuItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && !picked.some(p => p.dbId === i.dbId)).slice(0, 6)
    : [];

  async function submit() {
    if (picked.length === 0) { setError('Add at least one dish.'); return; }
    setBusy(true); setError('');
    try {
      await onSubmit({
        title: title.trim() || 'Featured set menu',
        items: picked.map(i => ({ name: i.name, price: i.price, img: i.img })),
        price: Number(price) || regular,
        activeDays: [0, 1, 2, 3, 4, 5, 6],
      });
    } catch { setError('Could not save the deal.'); setBusy(false); }
  }

  return (
    <Modal
      title="New deal"
      subtitle="Bundle dishes into a featured set menu"
      onClose={onClose}
      wide
      footer={<>
        <button className={styles.modalCancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={styles.modalSubmit} onClick={submit} disabled={busy}>{busy ? <Spinner size={13} /> : 'Publish deal'}</button>
      </>}
    >
      <label className={styles.formLabel}>Deal name
        <input className={styles.formInput} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Hearth · Table d'Hôte" autoFocus />
      </label>
      <label className={styles.formLabel}>Add dishes
        <input className={styles.formInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the menu…" />
      </label>
      {results.length > 0 && (
        <div className={styles.dealResults}>
          {results.map(i => (
            <button key={i.dbId} className={styles.dealResult} onClick={() => { setPicked(p => [...p, i]); setSearch(''); }}>
              <span>{i.name}</span><span className={styles.dealResultPrice}>{formatPrice(i.price)}</span>
            </button>
          ))}
        </div>
      )}
      {picked.length > 0 && (
        <div className={styles.dealPicked}>
          {picked.map((i, idx) => (
            <div key={i.dbId} className={styles.dealPickedRow}>
              <span className={styles.dealPickedIdx}>{idx + 1}</span>
              <span className={styles.dealPickedName}>{i.name}</span>
              <span className={styles.dealPickedPrice}>{formatPrice(i.price)}</span>
              <button className={styles.dealPickedRemove} onClick={() => setPicked(p => p.filter(x => x.dbId !== i.dbId))} aria-label="Remove"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className={styles.formGrid2}>
        <label className={styles.formLabel}>Bundle price (R)
          <input className={styles.formInput} type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} placeholder={String(regular || 0)} />
        </label>
        <div className={styles.dealRegular}>
          <span>Regular total</span>
          <strong>{formatPrice(regular)}</strong>
        </div>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </Modal>
  );
}

function NewAccountModal({ currentRole, onClose, onSubmit }: {
  currentRole?: string;
  onClose: () => void;
  onSubmit: (payload: { username: string; password: string; role: string; label: string }) => Promise<void>;
}) {
  const roleOptions = currentRole === 'owner' ? ['manager', 'waiter', 'kitchen'] : ['waiter', 'kitchen'];
  const [username, setUsername] = useState('');
  const [label, setLabel] = useState('');
  const [role, setRole] = useState(roleOptions[0]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [apkUrl, setApkUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getConfig().then(c => { if (c?.waiterApkUrl) setApkUrl(c.waiterApkUrl); }).catch(() => { /* success view falls back to username only */ });
  }, []);

  async function submit() {
    if (!/^[a-z0-9._-]{3,32}$/.test(username.trim().toLowerCase())) { setError('Username must be 3-32 chars: letters, numbers, dot, dash, underscore.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true); setError('');
    try {
      const uname = username.trim().toLowerCase();
      await onSubmit({ username: uname, password, role, label: label.trim() || username.trim() });
      setCreated(uname); setBusy(false);
    } catch (e) { setError((e as Error)?.message || 'Could not create the account.'); setBusy(false); }
  }

  const shareText = [
    apkUrl ? `Download the ${BRAND_NAME} Waiter app: ${apkUrl}` : '',
    `Username: ${created ?? ''}`,
  ].filter(Boolean).join('\n');

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError('Could not copy automatically — select the text and copy it manually.'); }
  }

  if (created) {
    return (
      <Modal
        title="Account created"
        subtitle={`${role} login for ${created}`}
        onClose={onClose}
        footer={<>
          <button className={styles.modalCancel} onClick={onClose}>Done</button>
          <button className={styles.modalSubmit} onClick={copyShare}>
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </>}
      >
        <label className={styles.formLabel}>Copy &amp; send to new staff
          <textarea className={styles.formTextarea} readOnly rows={3} value={shareText} onFocus={e => e.currentTarget.select()} />
        </label>
        <p className={styles.modalSubtitle}>They install the app from the link, then sign in with this username and the password you set.</p>
        {error && <p className={styles.formError}>{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal
      title="Add staff account"
      subtitle="Create a login for a team member"
      onClose={onClose}
      footer={<>
        <button className={styles.modalCancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button className={styles.modalSubmit} onClick={submit} disabled={busy}>{busy ? <Spinner size={13} /> : 'Create account'}</button>
      </>}
    >
      <label className={styles.formLabel}>Username
        <input className={styles.formInput} value={username} onChange={e => setUsername(e.target.value)} placeholder="lowercase, no spaces" autoFocus />
      </label>
      <label className={styles.formLabel}>Display name
        <input className={styles.formInput} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Sarah M." />
      </label>
      <div className={styles.formGrid2}>
        <label className={styles.formLabel}>Role
          <select className={styles.formInput} value={role} onChange={e => setRole(e.target.value)}>
            {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className={styles.formLabel}>Password
          <input className={styles.formInput} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="min 6 characters" />
        </label>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </Modal>
  );
}

// Manager → waiter dispatch presets (S10). Each creates a WaiterTask the waiter
// app surfaces instantly in its Alerts Center via the `waiterTaskCreated` socket.
const DISPATCH_ACTIONS: { type: string; title: string; message: string; priority: number }[] = [
  { type: 'manager_visit', title: 'Visit Table', message: 'Manager has asked you to visit this table.', priority: 2 },
  { type: 'complaint', title: 'Handle Complaint', message: 'Guest complaint — please handle promptly.', priority: 1 },
  { type: 'vip', title: 'VIP Guest', message: 'VIP guest at this table — give priority service.', priority: 1 },
  { type: 'special_request', title: 'Special Request', message: 'There is a special request at this table.', priority: 2 },
  { type: 'priority', title: 'Priority Service', message: 'Priority service required at this table.', priority: 1 },
];

function deskTableNum(tableId?: string) {
  return String(tableId || '').replace(/^table/i, '') || '?';
}

// S12 (manager side) + S10. Pending birthday-dessert approvals, manager dispatch
// presets, and the live floor-request queue, all in one console tab. Stays live
// via the admin socket room (managerApprovalRequested / waiterTask* events).
function ServiceDeskPanel({ tasks, onChange }: { tasks: WaiterTask[]; onChange: (t: WaiterTask[]) => void }) {
  const [table, setTable] = useState('1');
  const [busy, setBusy] = useState<number | string | null>(null);

  const reload = useCallback(() => {
    api.getWaiterTasks({ status: 'all' }).then(d => onChange((d as WaiterTask[]) || [])).catch(() => {});
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    import('../services/socket').then(({ getSocket }) => {
      if (cancelled) return;
      const socket = getSocket();
      socket.emit('joinAdmin', { restaurantId: 'trump' });
      const onEvt = () => reload();
      socket.on('managerApprovalRequested', onEvt);
      socket.on('waiterTaskCreated', onEvt);
      socket.on('waiterTaskUpdated', onEvt);
      cleanup = () => {
        socket.off('managerApprovalRequested', onEvt);
        socket.off('waiterTaskCreated', onEvt);
        socket.off('waiterTaskUpdated', onEvt);
      };
    });
    return () => { cancelled = true; cleanup(); };
  }, [reload]);

  const approvals = tasks
    .filter(t => t.type === 'birthday_approval' && t.status === 'open')
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const openTasks = tasks
    .filter(t => ['open', 'acknowledged'].includes(t.status) && t.type !== 'birthday_approval')
    // Newest first within the same priority band, so a fresh notification
    // never gets buried under an older one that merely shares a priority.
    .sort((a, b) => a.priority - b.priority || +new Date(b.createdAt) - +new Date(a.createdAt));

  async function decide(id: number, approved: boolean) {
    setBusy(id);
    try { await api.approveBirthday(id, approved); reload(); } catch {}
    setBusy(null);
  }
  async function dispatch(action: typeof DISPATCH_ACTIONS[number]) {
    const tableId = `table${parseInt(table, 10) || 1}`;
    setBusy(action.type);
    try {
      await api.createWaiterTask({ tableId, type: action.type, title: action.title, message: action.message, priority: action.priority });
      reload();
    } catch {}
    setBusy(null);
  }
  async function resolve(id: number) {
    setBusy(id);
    try { await api.resolveWaiterTask(id); reload(); } catch {}
    setBusy(null);
  }

  const card: CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 12 };
  const sectionTitle: CSSProperties = { fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--color-sand)', opacity: 0.7, margin: '22px 0 10px' };

  return (
    <div>
      {/* ── Pending approvals (S12) ── */}
      <div style={sectionTitle}>Pending approvals</div>
      {approvals.length === 0 ? (
        <div className={styles.emptyState}><p>No approvals waiting.</p></div>
      ) : approvals.map(t => (
        <div key={t.id} style={{ ...card, borderColor: 'rgba(var(--color-gold-rgb),0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-gold)' }}>🎂 {t.title} · Table {deskTableNum(t.tableId)}</div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{t.message}</div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>Requested by {t.waiterName || t.requestedBy || 'waiter'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`${styles.resvBtn} ${styles.resvBtnConfirm}`} disabled={busy === t.id} onClick={() => decide(t.id, true)}>Approve</button>
              <button className={`${styles.resvBtn} ${styles.resvBtnCancel}`} disabled={busy === t.id} onClick={() => decide(t.id, false)}>Reject</button>
            </div>
          </div>
        </div>
      ))}

      {/* ── Manager → waiter dispatch (S10) ── */}
      <div style={sectionTitle}>Send to waiter</div>
      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 14, opacity: 0.8 }}>Table</span>
          <input
            value={table}
            onChange={e => setTable(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.25)', color: 'inherit', fontSize: 16 }}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {DISPATCH_ACTIONS.map(a => (
            <button key={a.type} className={styles.actionBtn} disabled={busy === a.type} onClick={() => dispatch(a)}>
              {a.title}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live floor requests (S7/S10) ── */}
      <div style={sectionTitle}>Floor requests ({openTasks.length})</div>
      {openTasks.length === 0 ? (
        <div className={styles.emptyState}><p>No open requests.</p></div>
      ) : openTasks.map(t => (
        <div key={t.id} style={{ ...card, borderColor: t.priority <= 1 ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{t.title}{t.tableId ? ` · Table ${deskTableNum(t.tableId)}` : ''}</div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{t.message}</div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{t.status.toUpperCase()} · P{t.priority}</div>
            </div>
            <button className={styles.actionBtn} disabled={busy === t.id} onClick={() => resolve(t.id)}>Resolve</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// AI Shared Event System (admin side) — reads the SAME /api/ai-events rows the
// waiter app's TableAiEvents component reads (WaiterPage.tsx); no separate
// business logic, no re-derivation of priority/label/suggested action.
function AiEventsPanel({ events, onChange }: { events: AiEvent[]; onChange: (e: AiEvent[]) => void }) {
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [busy, setBusy] = useState<number | null>(null);

  const reload = useCallback(() => {
    api.getAiEvents({ status: 'all' }).then(d => onChange((d as AiEvent[]) || [])).catch(() => {});
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    import('../services/socket').then(({ getSocket }) => {
      if (cancelled) return;
      const socket = getSocket();
      socket.emit('joinAdmin', { restaurantId: 'trump' });
      const onEvt = () => reload();
      socket.on('aiEventCreated', onEvt);
      socket.on('aiEventUpdated', onEvt);
      cleanup = () => { socket.off('aiEventCreated', onEvt); socket.off('aiEventUpdated', onEvt); };
    });
    return () => { cancelled = true; cleanup(); };
  }, [reload]);

  async function resolve(id: number) {
    setBusy(id);
    try { await api.resolveAiEvent(id); reload(); } catch {}
    setBusy(null);
  }

  const visible = (statusFilter === 'open' ? events.filter(e => e.status === 'open') : events)
    .sort((a, b) => a.priority - b.priority || +new Date(b.createdAt) - +new Date(a.createdAt));

  const card: CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 12 };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={statusFilter === 'open' ? styles.actionBtnGold : styles.actionBtn} onClick={() => setStatusFilter('open')}>Open</button>
        <button className={statusFilter === 'all' ? styles.actionBtnGold : styles.actionBtn} onClick={() => setStatusFilter('all')}>All</button>
      </div>
      {visible.length === 0 ? (
        <div className={styles.emptyState}><p>No AI events{statusFilter === 'open' ? ' open right now' : ''}.</p></div>
      ) : visible.map(e => (
        <div key={e.id} style={{ ...card, borderColor: e.priority <= 1 ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{e.icon} {e.label}{e.tableId ? ` · Table ${deskTableNum(e.tableId)}` : ''}</div>
              {e.suggestedWaiterMessage && <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}><b>Waiter:</b> {e.suggestedWaiterMessage}</div>}
              {e.suggestedManagerAction && <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}><b>Manager:</b> {e.suggestedManagerAction}</div>}
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>
                {e.status.toUpperCase()} · P{e.priority} · confidence {Math.round(e.confidence * 100)}% · source: {e.source}
              </div>
            </div>
            {e.status === 'open' && (
              <button className={styles.actionBtn} disabled={busy === e.id} onClick={() => resolve(e.id)}>Resolve</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Guest CRM (admin side) — was previously built on the backend (guestService.js)
// with no UI consumer anywhere in the app; this is that missing surface.
function GuestsPanel({ guests }: { guests: Guest[] }) {
  const [query, setQuery] = useState('');
  const filtered = guests.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));

  const card: CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 10 };

  return (
    <div>
      <input
        placeholder="Search guests by name..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%', maxWidth: 360, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.25)', color: 'inherit', fontSize: 14, marginBottom: 16 }}
      />
      {filtered.length === 0 ? (
        <div className={styles.emptyState}><p>No guests match.</p></div>
      ) : filtered.map(g => (
        <div key={g.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {g.name}{g.vip ? ' · ⭐ VIP' : ''}{g.loyaltyTier ? ` · ${g.loyaltyTier}` : ''}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                {g.visitCount} visit{g.visitCount === 1 ? '' : 's'} · lifetime {formatPrice(g.lifetimeSpend)} · avg {formatPrice(g.avgSpend)}
              </div>
              {(g.dietary || g.allergies) && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {g.dietary && <span>Dietary: {g.dietary} </span>}
                  {g.allergies && <span style={{ color: '#f59e0b' }}>Allergy: {g.allergies}</span>}
                </div>
              )}
              {g.notes && <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>{g.notes}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Data Verification Tool — calls GET /api/admin/verify/:tableId
// (debugController.js), which queries the raw DB row AND the same
// service-layer function every admin/waiter screen actually calls, then
// diffs them field by field. A clean run here means "the pipeline this
// screen reads from is provably correct for this table right now" — use it
// after any deploy/reseed before trusting what's on screen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VerifyPanel() {
  const [tableNum, setTableNum] = useState('1');
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function check() {
    setLoading(true);
    setError('');
    try {
      const data = await api.verifyTable(`table${parseInt(tableNum, 10) || 1}`);
      setResult(data);
    } catch {
      setError('Verification request failed — check the table exists and you have owner/manager access.');
    } finally {
      setLoading(false);
    }
  }

  const card: CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 12 };
  const mono: CSSProperties = { fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span>Table</span>
        <input
          value={tableNum}
          onChange={e => setTableNum(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          style={{ width: 70, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.25)', color: 'inherit', fontSize: 16 }}
        />
        <button className={styles.actionBtnGold} disabled={loading} onClick={check}>{loading ? 'Checking...' : 'Check'}</button>
      </div>

      {error && <div className={styles.emptyState}><p>{error}</p></div>}

      {result && (
        <>
          <div style={{ ...card, borderColor: result.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {result.ok ? '✓ Database and backend API agree' : `✗ ${result.mismatches.length} mismatch(es) found`}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Checked {result.tableId} at {new Date(result.checkedAt).toLocaleTimeString()}</div>
            {result.mismatches.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.mismatches.map((m: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                    <b style={{ color: '#f59e0b' }}>{m.field}</b>
                    <div style={mono}>database: {JSON.stringify(m.database)}{'\n'}backendApi: {JSON.stringify(m.backendApi)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>👤 Guest {result.guest.seated ? '(seated)' : '(none seated on this table)'}</div>
            <div style={mono}>{JSON.stringify(result.guest, null, 2)}</div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>🔔 AI Events ({result.aiEvents.database.length})</div>
            <div style={mono}>{JSON.stringify(result.aiEvents, null, 2)}</div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>🍽️ Active Orders ({result.activeOrders.length})</div>
            <div style={mono}>{JSON.stringify(result.activeOrders, null, 2)}</div>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationButton() {
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'denied' | 'loading'>('idle');

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setStatus('subscribed');
    } else if ('Notification' in window && Notification.permission === 'denied') {
      setStatus('denied');
    }
  }, []);

  async function handleEnable() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus('denied'); return; }

      const resp = await fetch(ENDPOINTS.pushVapidKey).then(r => r.json());
      const publicKey = resp?.publicKey;
      if (!publicKey) { setStatus('idle'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey
      });

      await fetch(ENDPOINTS.pushSubscribe, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON())
      });
      setStatus('subscribed');
    } catch {
      setStatus('idle');
    }
  }

  if (status === 'subscribed') return <span className={styles.notifActive}><Bell size={14} /> Notifications on</span>;
  if (status === 'denied') return null;
  return (
    <button className={styles.notifBtn} onClick={handleEnable} disabled={status === 'loading'}>
      <Bell size={14} />
      {status === 'loading' ? 'Enabling…' : 'Enable Notifications'}
    </button>
  );
}
