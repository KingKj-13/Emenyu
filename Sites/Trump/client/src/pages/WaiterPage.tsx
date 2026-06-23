import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Check,
  ChefHat,
  Clock,
  Gift,
  Home,
  LogOut,
  MessageCircle,
  Minus,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  User,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import '../styles/waiter-theme.css';
import '../styles/waiter-v2.css';
import { WaiterProvider, useWaiter } from '../context/WaiterContext';
import { useAuth } from '../hooks/useAuth';
import { useHomeBackGuard } from '../hooks/useHomeBackGuard';
import { useMenuData } from '../context/MenuContext';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { RESTAURANT_ID } from '../constants/api';
import { buildMenuSections, flattenMenu } from '../lib/menuUtils';
import { resolveImage } from '../lib/imageResolver';
import { money, moneyExact } from '../lib/waiterFormat';
import { StartShiftScreen } from './waiter/StartShiftScreen';
import { SplitBillModal } from '../components/waiter/SplitBillModal';
import type {
  CartRec,
  CartRecResponse,
  ChatConversation,
  FloorState,
  FloorTable,
  Performance,
  TableIntel,
  WaiterAlert,
  WaiterTab,
  WaiterTask,
} from '../types/waiter';
import type { MenuItem } from '../types/menu';

type TableStatus = 'active' | 'attention' | 'calling' | 'ready' | 'bill' | 'manager' | 'birthday' | 'empty';
type TableSubView = 'details' | 'add';

const NAV: { tab: WaiterTab; label: string; Icon: typeof Home }[] = [
  { tab: 'home', label: 'Home', Icon: Home },
  { tab: 'tables', label: 'Tables', Icon: UtensilsCrossed },
  { tab: 'alerts', label: 'Alerts', Icon: Bell },
  { tab: 'chat', label: 'Chat', Icon: MessageCircle },
  { tab: 'profile', label: 'Profile', Icon: User },
];

const QUICK_CATS = ['Starters', 'Mains', 'Burgers', 'Pizza', 'Pasta', 'Seafood', 'Desserts', 'Drinks', 'Specials'];

function seatedLabel(minutes?: number | null) {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function tableNum(tableId?: string | null) {
  return String(tableId || '').replace(/^table/i, '') || '-';
}

function statusForTable(table: FloorTable, alerts: WaiterAlert[], tasks: WaiterTask[]): TableStatus {
  if (alerts.some(a => a.tableId === table.tableId && a.state === 'live' && a.kind === 'bell')) return 'calling';
  if (alerts.some(a => a.tableId === table.tableId && a.state === 'live' && a.kind === 'ready')) return 'ready';
  if (tasks.some(t => t.tableId === table.tableId && t.status === 'open' && t.type.includes('birthday'))) return 'birthday';
  if (tasks.some(t => t.tableId === table.tableId && t.status === 'open' && t.type.includes('manager'))) return 'manager';
  if (tasks.some(t => t.tableId === table.tableId && t.status === 'open' && ['complaint', 'refund', 'allergy'].includes(t.type))) return 'attention';
  if (table.status === 'ready') return 'ready';
  if (table.status === 'calling') return 'calling';
  if (table.status === 'empty') return 'empty';
  return table.spend > 0 ? 'active' : 'attention';
}

function statusCopy(status: TableStatus) {
  return {
    active: 'Active',
    attention: 'Needs Attention',
    calling: 'Calling Waiter',
    ready: 'Food Ready',
    bill: 'Waiting For Bill',
    manager: 'Manager Request',
    birthday: 'Birthday Opportunity',
    empty: 'Empty',
  }[status];
}

function useFloorAndTasks() {
  const { alerts } = useWaiter();
  const [floor, setFloor] = useState<FloorState | null>(null);
  const [tasks, setTasks] = useState<WaiterTask[]>([]);
  const load = useCallback(() => {
    api.getFloor().then(setFloor).catch(() => setFloor(null));
    api.getWaiterTasks({ status: 'all' }).then(setTasks).catch(() => setTasks([]));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('orderPlaced', load);
    socket.on('orderUpdated', load);
    socket.on('kitchenStatusUpdate', load);
    socket.on('waiterTaskCreated', load);
    socket.on('waiterTaskUpdated', load);
    return () => {
      socket.off('orderPlaced', load);
      socket.off('orderUpdated', load);
      socket.off('kitchenStatusUpdate', load);
      socket.off('waiterTaskCreated', load);
      socket.off('waiterTaskUpdated', load);
    };
  }, [load]);

  return { floor, tasks, alerts, reload: load };
}

function TopBar() {
  const { shift, liveAlertCount, setTab } = useWaiter();
  const { logout } = useAuth();
  return (
    <div className="wv-topbar">
      <button className="wv-staff" onClick={() => setTab('profile')}>
        <span className="wv-avatar">{(shift.name || 'W').charAt(0).toUpperCase()}</span>
        <span>
          <b>{shift.name || 'Waiter'}</b>
          <small>Online - {shift.role}</small>
        </span>
      </button>
      <div className="wv-top-actions">
        <button className="wv-icon-btn" onClick={() => setTab('alerts')} aria-label="Open alerts">
          <Bell size={20} />
          {liveAlertCount > 0 && <span className="wv-badge">{liveAlertCount}</span>}
        </button>
        <button className="wv-icon-btn" onClick={() => { if (confirm('Sign out of the waiter app?')) logout(); }} aria-label="Sign out">
          <LogOut size={19} />
        </button>
      </div>
    </div>
  );
}

function BottomNav() {
  const { tab, setTab, liveAlertCount, order } = useWaiter();
  const count = order.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <nav className="wv-bottomnav" aria-label="Waiter navigation">
      {NAV.map(({ tab: target, label, Icon }) => (
        <button key={target} className={`wv-navitem ${tab === target ? 'active' : ''}`} onClick={() => setTab(target)}>
          {target === 'alerts' && liveAlertCount > 0 && <span className="wv-navbadge">{liveAlertCount}</span>}
          {target === 'tables' && count > 0 && <span className="wv-navbadge">{count}</span>}
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function TableCard({ table, status, onOpen }: { table: FloorTable; status: TableStatus; onOpen: () => void }) {
  return (
    <button className={`wv-table-card st-${status}`} onClick={onOpen}>
      <div className="wv-card-top">
        <span className="wv-table-no">Table {table.number}</span>
        <span className="wv-status-pill">{statusCopy(status)}</span>
      </div>
      <div className="wv-table-meta">
        <span><Users size={14} /> {table.guests || 0}</span>
        <span><Clock size={14} /> {seatedLabel(table.seatedMinutes)}</span>
        <b>{table.spend ? money(table.spend) : 'R0'}</b>
      </div>
      <div className="wv-next-action">
        {status === 'ready' ? 'Run food now' : status === 'calling' ? 'Respond to guest' : status === 'birthday' ? 'Request dessert approval' : status === 'manager' ? 'Check manager note' : 'Open table'}
      </div>
    </button>
  );
}

function HomeScreen() {
  const { shift, selectTable, setTab } = useWaiter();
  const { floor, tasks, alerts } = useFloorAndTasks();
  const tables = floor?.tables || [];
  const myTables = tables.filter(t => shift.section.includes(t.number));
  const ranked = [...myTables].sort((a, b) => {
    const as = statusForTable(a, alerts, tasks);
    const bs = statusForTable(b, alerts, tasks);
    const rank: Record<TableStatus, number> = { calling: 0, ready: 1, attention: 2, birthday: 3, manager: 4, bill: 5, active: 6, empty: 7 };
    return rank[as] - rank[bs] || (b.seatedMinutes || 0) - (a.seatedMinutes || 0);
  });
  const next = ranked.find(t => statusForTable(t, alerts, tasks) !== 'empty');

  return (
    <main className="wv-screen">
      <section className="wv-priority">
        <p className="wv-kicker">Next best action</p>
        {next ? (
          <>
            <h1>Table {next.number}</h1>
            <p>{statusCopy(statusForTable(next, alerts, tasks))} - {next.guests || 0} guests - {money(next.spend || 0)}</p>
            <button className="wv-primary" onClick={() => selectTable(next.tableId)}>Open table</button>
          </>
        ) : (
          <>
            <h1>Floor clear</h1>
            <p>No active tables in your section right now.</p>
          </>
        )}
      </section>

      <div className="wv-metrics">
        <div><b>{myTables.filter(t => statusForTable(t, alerts, tasks) !== 'empty').length}</b><span>Active</span></div>
        <div><b>{alerts.filter(a => a.state === 'live').length + tasks.filter(t => t.status === 'open').length}</b><span>Alerts</span></div>
        <div><b>{money(myTables.reduce((sum, t) => sum + (t.spend || 0), 0))}</b><span>Spend</span></div>
      </div>

      <div className="wv-section-head">
        <h2>Assigned Tables</h2>
        <button onClick={() => setTab('tables')}>All tables</button>
      </div>
      <div className="wv-table-list">
        {ranked.map(table => (
          <TableCard key={table.tableId} table={table} status={statusForTable(table, alerts, tasks)} onOpen={() => selectTable(table.tableId)} />
        ))}
        {!ranked.length && <p className="wv-empty">No assigned tables found for this shift.</p>}
      </div>
    </main>
  );
}

function InsightTags({ intel, event }: { intel: TableIntel | null; event?: { label: string; type: string } }) {
  const guest = intel?.guestIntel;
  const tags = [
    event?.label,
    guest?.vip ? 'VIP' : '',
    guest?.returning ? 'Repeat Customer' : '',
    guest?.dietary,
    guest?.allergies ? `Allergy: ${guest.allergies}` : '',
    guest?.notes?.toLowerCase().includes('birthday') ? 'Birthday' : '',
    guest?.notes?.toLowerCase().includes('anniversary') ? 'Anniversary' : '',
  ].filter(Boolean);
  return (
    <div className="wv-chipgrid">
      {tags.length ? tags.map(tag => <span key={tag} className="wv-info-chip">{tag}</span>) : <span className="wv-muted">No guest insights yet</span>}
    </div>
  );
}

function Timeline({ status, placed }: { status?: string; placed: number }) {
  const steps = ['Sent To Kitchen', 'Preparing', 'Ready', 'Served'];
  const active = status === 'ready' ? 2 : placed > 0 ? 1 : 0;
  return (
    <div className="wv-timeline">
      {steps.map((step, index) => (
        <div key={step} className={index <= active ? 'done' : ''}>
          <span>{index < active ? <Check size={13} /> : index + 1}</span>
          <p>{step}</p>
        </div>
      ))}
    </div>
  );
}

function AiRecommendationPanel({ recs, onAdd }: { recs: CartRec[]; onAdd: (rec: CartRec) => void }) {
  const rec = recs[0];
  if (!rec) return <p className="wv-empty">Add an item to the cart for live AI recommendations.</p>;
  return (
    <section className="wv-ai-card">
      <div className="wv-ai-head">
        <Sparkles size={18} />
        <span>AI Recommendation</span>
      </div>
      <h3>{rec.name}</h3>
      <p>{rec.reason || 'Best available pairing for this cart.'}</p>
      <blockquote>{rec.script || `Many guests enjoy this with ${rec.name}.`}</blockquote>
      <div className="wv-ai-foot">
        <b>+{money(rec.upsell || rec.price || 0)}</b>
        <button onClick={() => onAdd(rec)}><Plus size={16} /> Add To Cart</button>
      </div>
    </section>
  );
}

function RevenuePanel({ currentSpend, recs }: { currentSpend: number; recs: CartRec[] }) {
  const uplift = recs.reduce((sum, rec) => sum + (rec.upsell || rec.price || 0), 0);
  return (
    <section className="wv-panel">
      <div className="wv-panel-title"><Receipt size={17} /> Revenue Opportunity</div>
      <div className="wv-revenue-row"><span>Current Spend</span><b>{moneyExact(currentSpend)}</b></div>
      {recs.slice(0, 3).map(rec => (
        <div className="wv-revenue-row" key={rec.name}><span>{rec.name}</span><b>+{money(rec.upsell || rec.price)}</b></div>
      ))}
      <div className="wv-revenue-total"><span>Potential Additional Revenue</span><b>{moneyExact(uplift)}</b></div>
    </section>
  );
}

function TableDetails({ table, onAddMode }: { table: FloorTable; onAddMode: () => void }) {
  const {
    selectedTableId,
    order,
    placedItems,
    events,
    addToOrder,
    changeQty,
    removeLine,
    orderTotal,
    sendToKitchen,
    sending,
    openOverlay,
    setTab,
    shift,
    showToast,
  } = useWaiter();
  const [intel, setIntel] = useState<TableIntel | null>(null);
  const [recData, setRecData] = useState<CartRecResponse | null>(null);
  const [requestingBirthday, setRequestingBirthday] = useState(false);
  const event = selectedTableId ? events[selectedTableId] : undefined;
  const cartSig = useMemo(() => order.map(line => `${line.name}:${line.quantity}`).join('|'), [order]);

  useEffect(() => {
    if (!selectedTableId) return;
    api.getTableIntel(selectedTableId).then(setIntel).catch(() => setIntel(null));
  }, [selectedTableId]);

  useEffect(() => {
    api.cartRecommendations({ cart: order.map(line => ({ name: line.name, price: line.price, qty: line.quantity })), event: event?.type || null })
      .then(setRecData)
      .catch(() => setRecData(null));
  }, [cartSig, event?.type, order]);

  function addRec(rec: CartRec) {
    addToOrder(rec);
    showToast(`Added ${rec.name}`);
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: rec.name, accepted: true, source: rec.source_title || 'cart-rec', value: rec.price }).catch(() => {});
    }
  }

  async function requestBirthday() {
    if (!selectedTableId) return;
    setRequestingBirthday(true);
    try {
      await api.requestBirthdayApproval({ tableId: selectedTableId, waiterName: shift.name, itemName: 'Complimentary dessert', reason: event?.label || 'Birthday opportunity' });
      showToast('Birthday approval sent to manager');
    } catch {
      showToast('Could not send approval request');
    } finally {
      setRequestingBirthday(false);
    }
  }

  return (
    <div className="wv-detail">
      <header className="wv-detail-head">
        <div>
          <p className="wv-kicker">Table Details</p>
          <h1>Table {table.number}</h1>
        </div>
        <span className={`wv-status-pill st-${statusForTable(table, [], [])}`}>{statusCopy(statusForTable(table, [], []))}</span>
      </header>

      <div className="wv-table-facts">
        <div><span>Guests</span><b>{table.guests || 0}</b></div>
        <div><span>Time Seated</span><b>{seatedLabel(table.seatedMinutes)}</b></div>
        <div><span>Current Spend</span><b>{money(table.spend + orderTotal)}</b></div>
      </div>

      <section className="wv-panel">
        <div className="wv-panel-title"><ChefHat size={17} /> Current Cart</div>
        {[...placedItems.map(p => ({ ...p, source: 'sent' as const })), ...order].map((line, index) => (
          <div className="wv-cart-line" key={`${line.name}-${index}`}>
            <div>
              <b>{line.quantity}x {line.name}</b>
              <small>{line.source === 'guest' ? 'Guest cart' : line.source === 'sent' ? 'Sent to kitchen' : 'Waiter added'}</small>
            </div>
            {'source' in line && line.source === 'sent' ? <span>{money(line.price * line.quantity)}</span> : (
              <>
                <div className="wv-stepper">
                  <button onClick={() => changeQty(index - placedItems.length, -1)}><Minus size={13} /></button>
                  <span>{line.quantity}</span>
                  <button onClick={() => changeQty(index - placedItems.length, 1)}><Plus size={13} /></button>
                </div>
                <button className="wv-plain-icon" onClick={() => removeLine(index - placedItems.length)}><Trash2 size={15} /></button>
              </>
            )}
          </div>
        ))}
        {!placedItems.length && !order.length && <p className="wv-empty">No items yet. Add from the quick menu.</p>}
      </section>

      <section className="wv-panel">
        <div className="wv-panel-title"><Activity size={17} /> Order Timeline</div>
        <Timeline status={intel?.tableInfo?.status} placed={placedItems.length} />
      </section>

      <section className="wv-panel">
        <div className="wv-panel-title"><User size={17} /> Guest Insights</div>
        <InsightTags intel={intel} event={event} />
        {event?.type === 'birthday' && (
          <button className="wv-secondary full" onClick={requestBirthday} disabled={requestingBirthday}>
            <Gift size={16} /> {requestingBirthday ? 'Requesting...' : 'Request Complimentary Dessert'}
          </button>
        )}
      </section>

      <AiRecommendationPanel recs={recData?.recommendations || []} onAdd={addRec} />
      <RevenuePanel currentSpend={table.spend + orderTotal} recs={recData?.recommendations || []} />

      <div className="wv-quick-actions">
        <button onClick={onAddMode}><Plus size={17} /> Add Item</button>
        <button onClick={() => openOverlay('split')}><SplitSquareHorizontal size={17} /> Split Bill</button>
        <button onClick={() => api.createWaiterTask({ tableId: selectedTableId || '', type: 'manager_request', title: 'Manager Request', message: 'Please visit this table.', priority: 1, waiterName: shift.name }).then(() => showToast('Manager request sent')).catch(() => showToast('Could not send manager request'))}>
          <ShieldAlert size={17} /> Call Manager
        </button>
        <button onClick={() => setTab('chat')}><MessageCircle size={17} /> View Chat</button>
      </div>

      <button className="wv-primary sticky" disabled={order.length === 0 || sending} onClick={sendToKitchen}>
        <Send size={16} /> {sending ? 'Sending...' : 'Send To Kitchen'}
      </button>
    </div>
  );
}

function AddItems({ onDone }: { onDone: () => void }) {
  const { menuData } = useMenuData();
  const { addToOrder, showToast, selectedTableId } = useWaiter();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('Starters');
  const sections = useMemo(() => buildMenuSections(menuData, new Set(), query), [menuData, query]);
  const allItems = useMemo(() => flattenMenu(menuData), [menuData]);
  const items = useMemo(() => {
    const q = query.toLowerCase();
    const pool = q
      ? allItems.filter(item => `${item.name} ${item.description || ''} ${item.category || ''}`.toLowerCase().includes(q))
      : allItems;
    const wanted = cat.toLowerCase();
    return pool.filter(item => {
      const text = `${item.category || ''} ${item.subcategory || ''} ${item.name || ''}`.toLowerCase();
      if (wanted === 'mains') return item.categoryType === 'MAIN' || text.includes('main') || text.includes('grill');
      if (wanted === 'drinks') return ['DRINK', 'WINE'].includes(String(item.categoryType));
      if (wanted === 'desserts') return item.categoryType === 'DESSERT' || text.includes('dessert');
      if (wanted === 'starters') return item.categoryType === 'STARTER' || text.includes('starter');
      return text.includes(wanted.slice(0, -1)) || text.includes(wanted);
    }).slice(0, 80);
  }, [allItems, cat, query]);

  return (
    <div className="wv-add">
      <div className="wv-add-head">
        <div>
          <p className="wv-kicker">Add Items</p>
          <h1>{selectedTableId ? `Table ${tableNum(selectedTableId)}` : 'Choose table'}</h1>
        </div>
        <button className="wv-secondary" onClick={onDone}>Done</button>
      </div>
      <label className="wv-search">
        <Search size={17} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${allItems.length} items`} />
      </label>
      <div className="wv-category-rail">
        {QUICK_CATS.map(label => <button key={label} className={cat === label ? 'active' : ''} onClick={() => setCat(label)}>{label}</button>)}
      </div>
      <div className="wv-item-grid">
        {items.map((item: MenuItem) => (
          <button key={item.name} className="wv-item-tile" onClick={() => { addToOrder(item); showToast(`Added ${item.name}`); }}>
            <span className="wv-item-thumb">{item.img ? <img src={resolveImage(item)} alt="" loading="lazy" /> : <UtensilsCrossed size={24} />}</span>
            <span>
              <b>{item.name}</b>
              <small>{money(item.price)}</small>
            </span>
            <Plus size={18} />
          </button>
        ))}
        {!items.length && <p className="wv-empty">No items match this category.</p>}
      </div>
      {!sections.length && <span />}
    </div>
  );
}

function TablesScreen() {
  const { selectedTableId, selectTable } = useWaiter();
  const { floor, tasks, alerts } = useFloorAndTasks();
  const [subView, setSubView] = useState<TableSubView>('details');
  const [query, setQuery] = useState('');
  const tables = floor?.tables || [];
  const selected = tables.find(table => table.tableId === selectedTableId) || tables.find(t => t.status !== 'empty') || tables[0];
  const filtered = query ? tables.filter(table => String(table.number).includes(query)) : tables;

  useEffect(() => {
    if (!selectedTableId && selected) selectTable(selected.tableId);
  }, [selectTable, selected, selectedTableId]);

  if (subView === 'add') return <main className="wv-screen"><AddItems onDone={() => setSubView('details')} /></main>;

  return (
    <main className="wv-screen">
      <label className="wv-search compact">
        <Search size={16} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Jump to table" inputMode="numeric" />
      </label>
      <div className="wv-mini-table-rail">
        {filtered.map(table => (
          <button key={table.tableId} className={table.tableId === selectedTableId ? 'active' : ''} onClick={() => selectTable(table.tableId)}>
            <b>{table.number}</b>
            <small>{statusCopy(statusForTable(table, alerts, tasks))}</small>
          </button>
        ))}
      </div>
      {selected ? <TableDetails table={selected} onAddMode={() => setSubView('add')} /> : <p className="wv-empty">No tables loaded.</p>}
    </main>
  );
}

function priorityForAlert(alert: WaiterAlert) {
  if (alert.kind === 'bell') return 1;
  if (alert.kind === 'ready') return 2;
  if (alert.kind === 'manager') return 1;
  if (alert.kind === 'event') return 3;
  return 4;
}

// Escalation thresholds (ms) — an alert older than this is "overdue" and pulses
// to the top of the queue (S7, S9).
const OVERDUE_MS: Record<WaiterAlert['kind'], number> = {
  bell: 90_000, manager: 90_000, ready: 150_000, event: 300_000,
  complaint: 90_000, vip: 180_000, birthday: 300_000,
};

function ageLabel(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function AlertsScreen() {
  const { alerts, respondAlert, dismissAlert, selectTable } = useWaiter();
  const { tasks, reload } = useFloorAndTasks();
  // Tick so "overdue" recomputes live without needing a new socket event.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const alertOverdue = (a: WaiterAlert) => now - a.createdAt > (OVERDUE_MS[a.kind] || 180_000);
  const liveAlerts = alerts
    .filter(a => a.state === 'live')
    .sort((a, b) => (Number(alertOverdue(b)) - Number(alertOverdue(a))) || (priorityForAlert(a) - priorityForAlert(b)) || (a.createdAt - b.createdAt));

  const taskOverdue = (t: WaiterTask) => t.priority <= 1 && t.status === 'open' && now - new Date(t.createdAt).getTime() > 120_000;
  const liveTasks = tasks
    .filter(t => ['open', 'acknowledged', 'approved'].includes(t.status))
    .sort((a, b) => (Number(taskOverdue(b)) - Number(taskOverdue(a))) || (a.priority - b.priority));

  const escalated = liveAlerts.filter(alertOverdue).length + liveTasks.filter(taskOverdue).length;

  function ackTask(id: number) {
    api.acknowledgeWaiterTask(id).then(reload).catch(() => {});
  }

  return (
    <main className="wv-screen">
      <div className="wv-page-title">
        <p className="wv-kicker">Alerts Center{escalated > 0 ? ` · ${escalated} overdue` : ''}</p>
        <h1>Priority Queue</h1>
      </div>
      {liveTasks.map(task => (
        <section key={task.id} className={`wv-alert-card pr-${task.priority} ${taskOverdue(task) ? 'overdue' : ''}`}>
          <div>
            <b>{task.title}</b>
            <span>{task.tableId ? `Table ${tableNum(task.tableId)} - ` : ''}{task.message}</span>
            <small>{task.status.toUpperCase()}{taskOverdue(task) ? ` · OVERDUE ${ageLabel(now - new Date(task.createdAt).getTime())}` : ''}</small>
          </div>
          <div className="wv-alert-actions">
            {task.tableId && <button onClick={() => selectTable(task.tableId)}>Open</button>}
            <button onClick={() => task.status === 'open' ? ackTask(task.id) : api.resolveWaiterTask(task.id).then(reload)}> {task.status === 'open' ? 'Ack' : 'Resolve'} </button>
          </div>
        </section>
      ))}
      {liveAlerts.map(alert => (
        <section key={alert.id} className={`wv-alert-card socket ${alert.kind} ${alertOverdue(alert) ? 'overdue' : ''}`}>
          <div>
            <b>{alert.title}</b>
            <span>{alert.message}</span>
            {alertOverdue(alert)
              ? <small>OVERDUE · waiting {ageLabel(now - alert.createdAt)}</small>
              : alert.script && <small>{alert.script}</small>}
          </div>
          <div className="wv-alert-actions">
            {alert.tableId && <button onClick={() => selectTable(alert.tableId!)}>Open</button>}
            <button onClick={() => respondAlert(alert.id)}>On my way</button>
            <button onClick={() => dismissAlert(alert.id)}>Dismiss</button>
          </div>
        </section>
      ))}
      {!liveAlerts.length && !liveTasks.length && <p className="wv-empty">All clear. No live waiter alerts.</p>}
    </main>
  );
}

function ChatScreen() {
  const { selectTable, shift, showToast } = useWaiter();
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [tableId, setTableId] = useState('table1');
  const [message, setMessage] = useState('');
  const load = useCallback(() => { api.getWaiterChatCenter().then(setConvos).catch(() => setConvos([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function analyze() {
    if (!message.trim()) return;
    try {
      const result = await api.analyzeWaiterChat({ tableId, message, waiterName: shift.name });
      setMessage('');
      load();
      showToast(result.tasks.length ? `${result.tasks.length} event detected` : 'No event detected');
    } catch {
      showToast('Could not analyze chat');
    }
  }

  return (
    <main className="wv-screen">
      <div className="wv-page-title">
        <p className="wv-kicker">Chat Center</p>
        <h1>Guest Signals</h1>
      </div>
      <section className="wv-panel">
        <div className="wv-panel-title"><MessageCircle size={17} /> Analyze Message</div>
        <div className="wv-chat-analyze">
          <input value={tableId} onChange={e => setTableId(e.target.value)} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Paste or type guest message" />
          <button className="wv-primary" onClick={analyze}>Analyze</button>
        </div>
      </section>
      <div className="wv-convo-list">
        {convos.map(convo => (
          <button key={convo.tableId} className="wv-convo" onClick={() => selectTable(convo.tableId)}>
            <span>
              <b>Table {tableNum(convo.tableId)}</b>
              <small>{convo.lastMessage || 'No message preview'}</small>
            </span>
            <span className="wv-event-tags">{convo.events.slice(0, 3).map(e => <em key={`${e.type}-${e.label}`}>{e.label}</em>)}</span>
          </button>
        ))}
        {!convos.length && <p className="wv-empty">Important conversations will appear here after chat analysis detects events.</p>}
      </div>
    </main>
  );
}

function ProfileScreen() {
  const { shift, endShift } = useWaiter();
  const [perf, setPerf] = useState<Performance | null>(null);
  useEffect(() => {
    api.getWaiterPerformance({ waiter: shift.name, period: 'today' }).then(setPerf).catch(() => setPerf(null));
  }, [shift.name]);
  return (
    <main className="wv-screen">
      <div className="wv-page-title">
        <p className="wv-kicker">Profile</p>
        <h1>{shift.name || 'Waiter'}</h1>
      </div>
      <div className="wv-profile-grid">
        <div><span>Tables Served</span><b>{perf?.tablesServed ?? 0}</b></div>
        <div><span>Revenue Generated</span><b>{money(perf?.salesDriven || 0)}</b></div>
        <div><span>Upsells Accepted</span><b>{perf?.upsellAccepted ?? 0}</b></div>
        <div><span>Additional Revenue</span><b>{money(perf?.upsellRevenue || 0)}</b></div>
        <div><span>Guest Rating</span><b>{perf?.guestRating != null ? `${perf.guestRating}★` : '—'}</b></div>
        <div><span>Upsell Rate</span><b>{Math.round((perf?.upsellRate || 0) * 100)}%</b></div>
      </div>
      <button className="wv-secondary full" onClick={endShift}>End Shift</button>
    </main>
  );
}

function Screen() {
  const { tab } = useWaiter();
  if (tab === 'tables') return <TablesScreen />;
  if (tab === 'alerts') return <AlertsScreen />;
  if (tab === 'chat') return <ChatScreen />;
  if (tab === 'profile') return <ProfileScreen />;
  return <HomeScreen />;
}

function Toast() {
  const { toast } = useWaiter();
  if (!toast) return null;
  return <div className="wv-toast">{toast}</div>;
}

function Overlays() {
  const { overlay } = useWaiter();
  return <>{overlay === 'split' && <SplitBillModal />}</>;
}

function WaiterShell() {
  const { shift } = useWaiter();
  useEffect(() => {
    const socket = getSocket();
    if (shift.started) {
      socket.emit('joinAsWaiter', { restaurantId: RESTAURANT_ID, name: shift.name });
      socket.emit('joinAdmin', { restaurantId: RESTAURANT_ID });
    }
  }, [shift.name, shift.started]);

  if (!shift.started) return <StartShiftScreen />;
  return (
    <>
      <TopBar />
      <Screen />
      <BottomNav />
      <Overlays />
      <Toast />
    </>
  );
}

export function WaiterPage() {
  useHomeBackGuard();
  return (
    <div className="waiter-app waiter-v2">
      <WaiterProvider>
        <WaiterShell />
      </WaiterProvider>
    </div>
  );
}
