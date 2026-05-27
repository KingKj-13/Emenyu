import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, BookOpen, Users, MessageSquare, LogOut, RefreshCw, UtensilsCrossed, BarChart2, QrCode, Download, Printer, CalendarDays, LayoutGrid, Clock, Bell, Upload, Image as ImageIcon, Film, Link2, Trash2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Spinner } from '../components/ui/Spinner';
import { formatPrice } from '../lib/menuUtils';
import styles from './AdminPage.module.css';

type Tab = 'orders' | 'history' | 'accounts' | 'chat' | 'menu' | 'reports' | 'qrcodes' | 'reservations' | 'tables' | 'deals';

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
  img?: string;
  video?: string;
  youtubeId?: string;
  imageVisible?: boolean;
  videoVisible?: boolean;
}

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

export function AdminPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('orders');
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
  const [reportSummary, setReportSummary] = useState<AnalyticsSummary | null>(null);
  const [reportItems, setReportItems] = useState<AnalyticsItem[]>([]);
  const [reportTables, setReportTables] = useState<AnalyticsTable[]>([]);
  const [reportHours, setReportHours] = useState<AnalyticsHour[]>([]);
  const [reportRatings, setReportRatings] = useState<RatingsData | null>(null);
  const [tableCarts, setTableCarts] = useState<TableCartEntry[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
        setChatLogs(data || []);
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getDateRange(range: ReportRange): { from?: string; to?: string } {
    const now = new Date();
    const to = now.toISOString();
    if (range === 'today') {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { from, to };
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
    try {
      const [summary, items, tables, hours, ratings] = await Promise.all([
        api.getAnalyticsSummary(params),
        api.getAnalyticsItems(params),
        api.getAnalyticsTables(params),
        api.getAnalyticsHours(params),
        api.getRatings(params),
      ]);
      setReportSummary(summary as AnalyticsSummary);
      setReportItems((items as AnalyticsItem[]) || []);
      setReportTables((tables as AnalyticsTable[]) || []);
      setReportHours((hours as AnalyticsHour[]) || []);
      setReportRatings(ratings as RatingsData || null);
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

  useEffect(() => { loadTab('orders'); }, []);

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

  const TABS: { key: Tab; label: string; icon: typeof ClipboardList }[] = [
    { key: 'orders', label: 'Orders', icon: ClipboardList },
    { key: 'history', label: 'History', icon: BookOpen },
    { key: 'accounts', label: 'Accounts', icon: Users },
    { key: 'chat', label: 'Chat Logs', icon: MessageSquare },
    { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
    { key: 'tables', label: 'Tables', icon: LayoutGrid },
    { key: 'deals', label: 'Deals', icon: Clock },
    { key: 'reports', label: 'Reports', icon: BarChart2 },
    { key: 'qrcodes', label: 'QR Codes', icon: QrCode },
    { key: 'reservations', label: 'Reservations', icon: CalendarDays },
  ];

  return (
    <AppShell requireRole={['owner', 'manager']}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Admin Dashboard</h1>
            <p className={styles.pageSubtitle}>{user?.label || user?.username} · {user?.role}</p>
          </div>
          <NotificationButton />
          <button className={styles.logoutBtn} onClick={logout} aria-label="Sign out">
            <LogOut size={16} />
            Sign Out
          </button>
        </div>

        <div className={styles.tabBar}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`${styles.tabBtn} ${tab === key ? styles.tabActive : ''}`}
              onClick={() => loadTab(key)}
              aria-selected={tab === key}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
          <button className={styles.refreshBtn} onClick={() => loadTab(tab)} aria-label="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>

        <div className={styles.tabContent}>
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
              {tab === 'accounts' && <AccountsList accounts={accounts} />}
              {tab === 'chat' && <ChatLogList logs={chatLogs} />}
              {tab === 'menu' && (
                <MenuAvailabilityList
                  items={menuItems}
                  togglingId={menuTogglingId}
                  selected={menuSelected}
                  bulkLoading={menuBulkLoading}
                  onToggle={handleToggleAvailability}
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
                  onRangeChange={r => {
                    setReportRange(r);
                    loadReports(r);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
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
              {order.tableId || order.table_number || 'Unknown table'}
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

function AccountsList({ accounts }: { accounts: unknown[] }) {
  if (accounts.length === 0) return <div className={styles.emptyState}><p>No accounts found</p></div>;
  return (
    <div className={styles.accountList}>
      {(accounts as Array<{ username: string; role: string; label?: string; status?: string }>).map((acc, i) => (
        <div key={i} className={styles.accountRow}>
          <span className={styles.accName}>{acc.label || acc.username}</span>
          <span className={styles.accUsername}>@{acc.username}</span>
          <span className={styles.accRole}>{acc.role}</span>
          <span className={`${styles.accStatus} ${acc.status === 'suspended' ? styles.suspended : ''}`}>
            {acc.status || 'active'}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChatLogList({ logs }: { logs: unknown[] }) {
  if (logs.length === 0) return <div className={styles.emptyState}><p>No chat logs</p></div>;
  return (
    <div className={styles.chatLogList}>
      {(logs as Array<{ timestamp?: string; tableId?: string; message?: string; reply?: string }>).map((log, i) => (
        <div key={i} className={styles.chatLog}>
          <div className={styles.chatLogMeta}>
            <span>{log.tableId || 'Unknown'}</span>
            {log.timestamp && <span>{new Date(log.timestamp).toLocaleString()}</span>}
          </div>
          {log.message && <p className={styles.chatLogMsg}><strong>Q:</strong> {log.message}</p>}
          {log.reply && <p className={styles.chatLogReply}><strong>A:</strong> {log.reply}</p>}
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'rgba(198,162,75,0.15)',
  confirmed: 'rgba(34,197,94,0.12)',
  seated: 'rgba(99,102,241,0.15)',
  cancelled: 'rgba(239,68,68,0.1)'
};
const STATUS_TEXT: Record<string, string> = {
  pending: '#c6a24b',
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
                <span>👥 {r.partySize} {r.partySize === 1 ? 'person' : 'people'}</span>
                <span>🕐 {new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {r.tableId && <span>🪑 {r.tableId}</span>}
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
const QR_BASE = 'https://emenyu.com/Trump';

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

function ReportsPanel({ range, summary, items, tables, hours, ratings, onRangeChange }: {
  range: ReportRange;
  summary: AnalyticsSummary | null;
  items: AnalyticsItem[];
  tables: AnalyticsTable[];
  hours: AnalyticsHour[];
  ratings: RatingsData | null;
  onRangeChange: (r: ReportRange) => void;
}) {
  const maxTableRevenue = Math.max(...tables.map(t => t.revenue), 1);
  const maxHourCount = Math.max(...hours.map(h => h.count), 1);

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
                <span key={s} className={s <= Math.round(ratings.average) ? styles.starFilled : styles.starEmpty}>★</span>
              ))}
            </div>
            <div className={styles.ratingCount}>{ratings.count} review{ratings.count !== 1 ? 's' : ''}</div>
          </div>
          {ratings.recent.filter(r => r.comment).slice(0, 10).map(r => (
            <div key={r.id} className={styles.ratingComment}>
              <div className={styles.ratingCommentMeta}>
                <span className={styles.ratingCommentStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                <span className={styles.ratingCommentTable}>{r.tableId.replace(/^table/, 'Table ')}</span>
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

function MenuAvailabilityList({ items, togglingId, selected, bulkLoading, onToggle, onDelete, onSelect, onBulkAction, onMediaChange }: {
  items: AdminMenuItem[];
  togglingId: number | null;
  selected: Set<number>;
  bulkLoading: boolean;
  onToggle: (item: AdminMenuItem) => void;
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

      const resp = await fetch('/Trump/api/push/vapid-key').then(r => r.json());
      const publicKey = resp?.publicKey;
      if (!publicKey) { setStatus('idle'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey
      });

      await fetch('/Trump/api/push/subscribe', {
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
