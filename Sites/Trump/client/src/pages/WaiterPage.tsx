import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Play,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  SplitSquareHorizontal,
  Star,
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
import { resolveThumbnail, resolveVideo } from '../lib/imageResolver';
import { money, moneyExact } from '../lib/waiterFormat';
import { StartShiftScreen } from './waiter/StartShiftScreen';
import { SplitBillModal } from '../components/waiter/SplitBillModal';
import { ShiftPanel } from '../components/operations/ShiftPanel';
import { OwnershipPanel } from '../components/operations/OwnershipPanel';
import { TableTimeline } from '../components/operations/TableTimeline';
import { NotificationBell } from '../components/operations/NotificationBell';
import { Spinner } from '../components/ui/Spinner';
import type {
  CartRec,
  CartRecResponse,
  ChatConversation,
  FloorState,
  FloorTable,
  GuestEvent,
  Opportunity,
  Performance,
  RecommendationStatus,
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

// Phase 2 (Waiter Experience): "Estimated Additional Value" + occasion on the
// table overview reuse the SAME per-table opportunity the AI Table Coach
// already computes (Phase 1's aiService.recommend() -> opportunityService),
// fetched only for the waiter's own assigned/non-empty tables (a handful),
// not the whole floor — keeps this instant rather than firing 30 calls.
function useTableIntelMap(tableIds: string[]) {
  const [byTable, setByTable] = useState<Record<string, TableIntel>>({});
  const key = tableIds.join(',');
  useEffect(() => {
    let cancelled = false;
    Promise.all(tableIds.map(id => api.getTableIntel(id).then(intel => [id, intel] as const).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const next: Record<string, TableIntel> = {};
        results.forEach(r => { if (r) next[r[0]] = r[1]; });
        setByTable(next);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return byTable;
}

// One-line narrative combining what's already loaded (occasion + best
// opportunity + guest count) — composed client-side, not a new backend call.
function tableIntelSummary(table: FloorTable, intel: TableIntel | undefined, event?: GuestEvent): string {
  const parts: string[] = [];
  if (event?.label) parts.push(`${event.label}.`);
  const opp = intel?.opportunity;
  if (opp?.hasOpportunity && opp.suggestedItem) {
    const action = opp.bestAction ? opp.bestAction : `Recommend the ${opp.suggestedItem.name}`;
    parts.push(`${action}.`);
  }
  if (!parts.length) {
    parts.push(table.guests ? `${table.guests} guests seated, no live opportunity yet.` : 'No live opportunity yet.');
  }
  return parts.join(' ');
}

function useFloorAndTasks() {
  const { alerts } = useWaiter();
  const [floor, setFloor] = useState<FloorState | null>(null);
  const [tasks, setTasks] = useState<WaiterTask[]>([]);
  // Every consumer of this hook previously had no way to tell "still loading"
  // apart from "genuinely no active tables" — both looked identical (floor
  // null / tasks []), so on-shift staff briefly saw a false "nothing here"
  // message on every mount instead of a loading indicator.
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    Promise.allSettled([
      api.getFloor().then(setFloor).catch(() => setFloor(null)),
      api.getWaiterTasks({ status: 'all' }).then(setTasks).catch(() => setTasks([])),
    ]).finally(() => setLoading(false));
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

  return { floor, tasks, alerts, reload: load, loading };
}

function TopBar() {
  const { shift, setTab } = useWaiter();
  const { logout } = useAuth();
  return (
    <div className="wv-topbar">
      <button className="wv-staff" onClick={() => setTab('profile')}>
        <span className="wv-avatar">{(shift.name || 'W').charAt(0).toUpperCase()}</span>
        <span>
          <b>{shift.name || 'Waiter'}</b>
          <small>Online · {shift.role}</small>
        </span>
      </button>
      <div className="wv-top-actions">
        {/* Floor alerts (guest calls, food ready) are one tap away via the
            Alerts bottom-nav item, which already carries this badge — a second
            bell here duplicated it. This one is the general notification center. */}
        <NotificationBell />
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

function TableCard({ table, status, intel, event, hasUpdate, onOpen }: {
  table: FloorTable; status: TableStatus; intel?: TableIntel; event?: GuestEvent; hasUpdate?: boolean; onOpen: () => void;
}) {
  const ev = intel?.opportunity?.hasOpportunity ? (intel.opportunity.expectedValue ?? intel.opportunity.increase) : 0;
  return (
    <button className={`wv-table-card st-${status} ${table.isLuxury ? 'wv-luxury' : ''}`} onClick={onOpen}>
      {hasUpdate && <span className="wv-update-dot" aria-label="New activity" />}
      <div className="wv-card-top">
        <span className="wv-table-no">
          {table.isLuxury && <Sparkles size={12} className="wv-luxury-badge" />}
          {table.isLuxury ? table.displayName : `Table ${table.number}`}
        </span>
        <span className="wv-status-pill">{statusCopy(status)}</span>
      </div>
      <div className="wv-table-meta">
        <span><Users size={14} /> {table.guests || 0}</span>
        <span><Clock size={14} /> {seatedLabel(table.seatedMinutes)}</span>
        <b>{table.spend ? money(table.spend) : 'R0'}</b>
      </div>
      {(event?.label || ev > 0) && (
        <div className="wv-card-intel">
          {event?.label && <span className="wv-occasion-chip">{event.emoji} {event.label}</span>}
          {ev > 0 && <span className="wv-ev-chip">+{money(ev)} potential</span>}
        </div>
      )}
      <div className="wv-next-action">
        {status === 'ready' ? 'Run food now' : status === 'calling' ? 'Respond to guest' : status === 'birthday' ? 'Request dessert approval' : status === 'manager' ? 'Check manager note' : 'Open table'}
      </div>
    </button>
  );
}

function HomeScreen() {
  const { shift, selectTable, setTab, events, unseenTableUpdates } = useWaiter();
  const { floor, tasks, alerts, loading } = useFloorAndTasks();
  const tables = floor?.tables || [];
  const myTables = tables.filter(t => shift.section.includes(t.number));
  const ranked = [...myTables].sort((a, b) => {
    const as = statusForTable(a, alerts, tasks);
    const bs = statusForTable(b, alerts, tasks);
    const rank: Record<TableStatus, number> = { calling: 0, ready: 1, attention: 2, birthday: 3, manager: 4, bill: 5, active: 6, empty: 7 };
    return rank[as] - rank[bs] || (b.seatedMinutes || 0) - (a.seatedMinutes || 0);
  });
  const next = ranked.find(t => statusForTable(t, alerts, tasks) !== 'empty');
  const activeTableIds = useMemo(() => ranked.filter(t => statusForTable(t, alerts, tasks) !== 'empty').map(t => t.tableId), [ranked, alerts, tasks]);
  const intelByTable = useTableIntelMap(activeTableIds);
  const nextIntel = next ? intelByTable[next.tableId] : undefined;
  const nextEvent = next ? events[next.tableId] : undefined;

  return (
    <main className="wv-screen">
      <section className="wv-priority">
        <p className="wv-kicker">Next best action</p>
        {loading ? (
          <div className="wv-empty" style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><Spinner size={28} /></div>
        ) : next ? (
          <>
            <h1>{next.isLuxury ? next.displayName : `Table ${next.number}`}</h1>
            <p>{statusCopy(statusForTable(next, alerts, tasks))} · {next.guests || 0} guests · {money(next.spend || 0)}</p>
            <p className="wv-intel-summary">{tableIntelSummary(next, nextIntel, nextEvent)}</p>
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
          <TableCard
            key={table.tableId}
            table={table}
            status={statusForTable(table, alerts, tasks)}
            intel={intelByTable[table.tableId]}
            event={events[table.tableId]}
            hasUpdate={unseenTableUpdates.has(table.tableId)}
            onOpen={() => selectTable(table.tableId)}
          />
        ))}
        {!loading && !ranked.length && <p className="wv-empty">No assigned tables found for this shift.</p>}
      </div>
    </main>
  );
}

// Demo blocker pass 3 -- guestIntel (below) only exists once a recognized
// Guest record has been manually linked to the table via the seat-guest flow;
// it says nothing about what's actually in the cart, and most tables during a
// demo won't have one. These tags read the cart itself instead, so a table
// shows *something* useful (breakfast/healthy/premium/pairing-gap signals)
// from the moment items are in it, with no guest-seating step required.
// categoryType is only reliably present on freshly-added (order) lines, not
// already-sent (placedItems) ones (the server's syncHistory payload doesn't
// carry it) -- name-keyword matching covers both, categoryType sharpens it
// where available.
function deriveCartInsights(cart: { name: string; price: number; quantity: number; categoryType?: string }[]): string[] {
  if (!cart.length) return [];
  const tags: string[] = [];
  const total = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const nameText = cart.map(l => l.name.toLowerCase()).join(' | ');
  const hasCategory = (type: string) => cart.some(l => l.categoryType === type);
  const nameMatches = (re: RegExp) => re.test(nameText);

  if (nameMatches(/coffee|espresso|americano|cappuccino|breakfast|morning|oats|pages|croissant|omelette|toast/)) {
    tags.push('Breakfast guest');
  }
  if (nameMatches(/salad|juice|smoothie|oats|fruit|vegan|vegetarian|healthy/)) {
    tags.push('Healthy preference');
  }
  if (total >= 500) tags.push('Premium guest');

  const hasMain = hasCategory('MAIN') || nameMatches(/fillet|steak|flame|ribeye|chicken|fish|pasta|burger|prawns/);
  const hasWine = hasCategory('WINE') || nameMatches(/wine|sauvignon|merlot|ros[eé]|champagne|cabernet|brut/);
  if (hasMain && !hasWine) tags.push('Wine pairing opportunity');

  const hasDessert = hasCategory('DESSERT') || nameMatches(/cake|dessert|ice cream|pudding|br[uû]l[eé]e|chocolate|sweet tooth/);
  if (hasMain && !hasDessert) tags.push('Dessert opportunity');

  return tags;
}

function InsightTags({ intel, event, cart }: { intel: TableIntel | null; event?: { label: string; type: string }; cart: { name: string; price: number; quantity: number; categoryType?: string }[] }) {
  const guest = intel?.guestIntel;
  const tags = [
    event?.label,
    guest?.vip ? 'VIP' : '',
    guest?.returning ? 'Repeat Customer' : '',
    guest?.dietary,
    guest?.allergies ? `Allergy: ${guest.allergies}` : '',
    guest?.notes?.toLowerCase().includes('birthday') ? 'Birthday' : '',
    guest?.notes?.toLowerCase().includes('anniversary') ? 'Anniversary' : '',
    ...deriveCartInsights(cart),
  ].filter(Boolean);
  return (
    <div className="wv-chipgrid">
      {tags.length ? tags.map(tag => <span key={tag} className="wv-info-chip">{tag}</span>) : <span className="wv-muted">No guest insights yet</span>}
    </div>
  );
}

function Timeline({ status, placed }: { status?: string; placed: number }) {
  const steps = ['Sent To Kitchen', 'Preparing', 'Ready', 'Served'];
  const active = status === 'served' ? 3 : status === 'ready' ? 2 : placed > 0 ? 1 : 0;
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

// Labels only ("Traditional" reads better to a waiter/guest than "Friendly"
// for the same underlying script — see aiService.js/nlgService.js's
// `professional`/`friendly`/`luxury` tone keys, left unchanged to avoid a
// wider server-side rename).
const TONE_TABS: { key: keyof NonNullable<CartRec['scripts']>; label: string }[] = [
  { key: 'professional', label: 'Professional' },
  { key: 'friendly', label: 'Traditional' },
  { key: 'luxury', label: 'Luxury' },
];

const STATUS_LABEL: Record<RecommendationStatus, string> = {
  pending: 'Pending', suggested: 'Suggested', accepted: 'Accepted', declined: 'Declined', ignored: 'Ignored',
};

// Phase 2 (Waiter Experience): every rec here already carries confidence/
// expectedValue/replacement (Phase 1) plus professional/friendly/luxury
// scripts (server-composed via the existing nlgService, see aiService.js
// cartRecommendations()) — this panel only presents what's already computed.
function AiRecommendationPanel({ recs, hasCartItems, onAdd, onDecline, statusByName, isLuxury }: {
  recs: CartRec[]; hasCartItems: boolean; onAdd: (rec: CartRec) => void; onDecline: (rec: CartRec) => void; statusByName: Record<string, RecommendationStatus>; isLuxury?: boolean;
}) {
  // Luxury tables default to the luxury delivery style; the waiter can still
  // switch tabs manually for a given table.
  const [tone, setTone] = useState<keyof NonNullable<CartRec['scripts']>>(isLuxury ? 'luxury' : 'friendly');
  const rec = recs[0];
  if (!rec) {
    // A guided demo chain that's run its full course deliberately stops
    // suggesting a "next" item (see scriptedDemoChains.js) -- that's correct,
    // not a bug, but the cart is NOT empty at that point, so telling the
    // waiter to "add an item" is actively wrong. Only show that copy when
    // there's genuinely nothing in the cart yet.
    return <p className="wv-empty">{hasCartItems ? 'No further suggestions right now.' : 'Add an item to the cart for live AI recommendations.'}</p>;
  }
  const status = statusByName[rec.name] || 'suggested';
  const script = rec.scripts?.[tone] || rec.script || `Many guests enjoy this with ${rec.name}.`;
  const isSettled = status === 'accepted' || status === 'declined';

  return (
    <section className="wv-ai-card">
      <div className="wv-ai-head">
        <Sparkles size={18} />
        <span>AI Recommendation</span>
        <span className={`wv-status-chip st-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <h3>{rec.name}</h3>
      <div className="wv-rec-metrics">
        {typeof rec.confidence === 'number' && <span className="wv-metric-chip">Confidence {Math.round(rec.confidence * 100)}%</span>}
        {typeof rec.expectedValue === 'number' && rec.expectedValue > 0 && <span className="wv-metric-chip">EV {moneyExact(rec.expectedValue)}</span>}
        {rec.replacement && <span className="wv-metric-chip">Upgrade from {rec.replacement.name}</span>}
      </div>
      {rec.scripts && (
        <div className="wv-tone-tabs" role="tablist" aria-label="Delivery style">
          {TONE_TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tone === t.key} className={tone === t.key ? 'active' : ''} onClick={() => setTone(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <blockquote>{script}</blockquote>
      <div className="wv-ai-foot">
        <b>+{money(rec.upsell || rec.price || 0)}</b>
        {!isSettled && (
          <div className="wv-ai-actions">
            <button className="wv-plain-icon" onClick={() => onDecline(rec)} aria-label="Decline recommendation"><Trash2 size={15} /></button>
            <button onClick={() => onAdd(rec)}><Plus size={16} /> Add To Cart</button>
          </div>
        )}
      </div>
    </section>
  );
}

// Phase 2 (Waiter Experience): heuristic per-seat presentation of the ONE
// shared table cart (no schema change — no per-guest cart data exists). Items
// are round-robin-assigned to seats purely for display, grouped into
// drinks/mains/desserts by categoryType where known.
function roughCourse(categoryType?: string): 'Drinks' | 'Mains' | 'Desserts' | 'Other' {
  const t = (categoryType || '').toUpperCase();
  if (t === 'WINE' || t === 'DRINK') return 'Drinks';
  if (t === 'MAIN') return 'Mains';
  if (t === 'DESSERT') return 'Desserts';
  return 'Other';
}

function SeatBreakdown({ table, lines }: { table: FloorTable; lines: { name: string; quantity: number; categoryType?: string }[] }) {
  const seatCount = Math.max(1, Math.min(table.guests || 1, 12));
  if (seatCount <= 1 || lines.length === 0) return null;
  const seats: { name: string; quantity: number; categoryType?: string }[][] = Array.from({ length: seatCount }, () => []);
  lines.forEach((line, i) => seats[i % seatCount].push(line));

  return (
    <section className="wv-panel">
      <div className="wv-panel-title"><Users size={17} /> Per Seat</div>
      <div className="wv-seat-grid">
        {seats.map((seatLines, i) => {
          const byCourse: Record<string, string[]> = {};
          seatLines.forEach(l => {
            const course = roughCourse(l.categoryType);
            (byCourse[course] ||= []).push(`${l.quantity}x ${l.name}`);
          });
          return (
            <div className="wv-seat-card" key={i}>
              <b>Seat {i + 1}</b>
              {seatLines.length === 0 && <small className="wv-muted">No items yet</small>}
              {(['Drinks', 'Mains', 'Desserts', 'Other'] as const).filter(c => byCourse[c]?.length).map(c => (
                <div key={c} className="wv-seat-course">
                  <span>{c}</span>
                  <small>{byCourse[c].join(', ')}</small>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RevenuePanel({ currentSpend, recs, opportunity }: { currentSpend: number; recs: CartRec[]; opportunity?: Opportunity | null }) {
  const uplift = recs.reduce((sum, rec) => sum + (rec.upsell || rec.price || 0), 0);
  // A scripted demo chain that's run its full course deliberately stops
  // suggesting a NEXT item (cartRecommendations/aiService.js), which zeroed
  // this out even with the merged-cart fix above -- but intel.opportunity is
  // computed by a separate, non-scripted-aware path (opportunityService.js)
  // that still has a real answer in that state (confirmed live: the same
  // table's Home-screen summary showed "+R1,042 potential" while this panel
  // showed R0 for the identical cart). Falling back to it here instead of
  // silently showing zero keeps the two views consistent.
  const fallbackItem = uplift === 0 && opportunity?.hasOpportunity ? opportunity.suggestedItem : null;
  const displayUplift = uplift > 0 ? uplift : (opportunity?.increase || 0);
  return (
    <section className="wv-panel">
      <div className="wv-panel-title"><Receipt size={17} /> Revenue Opportunity</div>
      <div className="wv-revenue-row"><span>Current Spend</span><b>{moneyExact(currentSpend)}</b></div>
      {recs.slice(0, 3).map(rec => (
        <div className="wv-revenue-row" key={rec.name}><span>{rec.name}</span><b>+{money(rec.upsell || rec.price)}</b></div>
      ))}
      {fallbackItem && (
        <div className="wv-revenue-row" key={fallbackItem.name}><span>{fallbackItem.name}</span><b>+{money(opportunity?.increase || fallbackItem.price)}</b></div>
      )}
      <div className="wv-revenue-total"><span>Potential Additional Revenue</span><b>{moneyExact(displayUplift)}</b></div>
    </section>
  );
}

function TableDetails({ table, onAddMode }: { table: FloorTable; onAddMode: () => void }) {
  const {
    selectedTableId,
    selectTable,
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
  const [statusByName, setStatusByName] = useState<Record<string, RecommendationStatus>>({});
  const [completing, setCompleting] = useState(false);
  const event = selectedTableId ? events[selectedTableId] : undefined;
  // Root cause (demo blocker pass 3): this used to be order-only (the
  // not-yet-submitted staging list). The instant a table's items are sent to
  // kitchen, `order` collapses to [] (by the same syncCart broadcast that
  // populates `placedItems`), so the AI/Revenue panels below went blank right
  // when a real cart existed -- not because recommendations are gated on
  // kitchen submission, but because they were reading the one piece of state
  // guaranteed to empty out at that exact moment. The server's own
  // buildTableCart() (waiterApiController.js) already merges sent + staged
  // items for the same reason; mirroring that here so recommendations/
  // insights/revenue reflect the table's ACTUAL cart throughout its lifecycle,
  // not just the pre-submission staging step.
  const fullCart = useMemo(() => [...placedItems, ...order], [placedItems, order]);
  const cartSig = useMemo(() => fullCart.map(line => `${line.name}:${line.quantity}`).join('|'), [fullCart]);
  // Bug fix: TableDetails now stays mounted (see TablesScreen) while the
  // waiter is on the AddItems overlay, so this effect already fires the
  // instant an item is added -- but the panel it feeds is visually behind
  // that overlay until the waiter taps "Done". A toast (rendered at the
  // WaiterShell level, above every screen and overlay) gives them the same
  // "recommendation is ready" feedback in real time, without needing to
  // back out first. Tracked per table so switching tables doesn't replay a
  // stale toast, and only fires once per distinct recommendation name so it
  // doesn't repeat on every unrelated cart change.
  const lastToastedRecRef = useRef<{ tableId: string; name: string } | null>(null);

  useEffect(() => {
    if (!selectedTableId) return;
    // Was keyed on [selectedTableId] only, so intel.opportunity/guestIntel/
    // tableInfo.status were fetched once per table-select and never refreshed
    // — the same "goes stale on cart change" bug as recData below, just with
    // no cart-driven liveness at all (recData's had *some*, incidentally, via
    // order changing). Now re-fetches on the same cart signature.
    api.getTableIntel(selectedTableId).then(setIntel).catch(() => setIntel(null));
  }, [selectedTableId, cartSig]);

  useEffect(() => {
    // Guards against an out-of-order network resolution: if the waiter adds an
    // item quickly, this effect re-fires with the updated cart, but the PRIOR
    // (pre-add) request's promise can still resolve after the new one — without
    // this flag its stale data would clobber the fresh response and make the
    // just-added item look like it's still being recommended.
    let cancelled = false;
    api.cartRecommendations({
      cart: fullCart.map(line => ({ name: line.name, price: line.price, qty: line.quantity })),
      event: event?.type || null,
      mode: table.isLuxury ? 'luxury' : 'standard',
      tableId: table.tableId,
    })
      .then(data => {
        if (cancelled) return;
        setRecData(data);
        const top = data?.recommendations?.[0];
        if (top) {
          setStatusByName(prev => (prev[top.name] ? prev : { ...prev, [top.name]: 'suggested' }));
          const already = lastToastedRecRef.current;
          if (!already || already.tableId !== table.tableId || already.name !== top.name) {
            lastToastedRecRef.current = { tableId: table.tableId, name: top.name };
            showToast(`AI suggests: ${top.name}`);
          }
        }
      })
      .catch(() => { if (!cancelled) setRecData(null); });
    return () => { cancelled = true; };
  }, [cartSig, event?.type, fullCart, table.tableId, table.isLuxury, showToast]);

  // Phase 2 (Waiter Experience): a suggested recommendation that sits untouched
  // for a while is "ignored" — reuses the same status chip, no separate system.
  useEffect(() => {
    const top = recData?.recommendations?.[0];
    if (!top) return;
    const timer = setTimeout(() => {
      setStatusByName(prev => (prev[top.name] === 'suggested' ? { ...prev, [top.name]: 'ignored' } : prev));
    }, 45_000);
    return () => clearTimeout(timer);
  }, [recData]);

  function addRec(rec: CartRec) {
    addToOrder(rec);
    showToast(`Added ${rec.name}`);
    setStatusByName(prev => ({ ...prev, [rec.name]: 'accepted' }));
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: rec.name, accepted: true, source: rec.source_title || 'cart-rec', value: rec.price }).catch(() => {});
    }
  }

  async function declineRec(rec: CartRec) {
    setStatusByName(prev => ({ ...prev, [rec.name]: 'declined' }));
    if (selectedTableId) {
      api.recordUpsell({ waiterName: shift.name, tableId: selectedTableId, suggestedItem: rec.name, accepted: false, source: rec.source_title || 'cart-rec', value: 0 }).catch(() => {});
    }
    // Curated Demo Mode: re-ask the same accept/skip/no-loop stage machine
    // recommend() uses (curatedDemoJourney.js) for the next alternative — up
    // to 3 mains, no loop back to an already-declined one. A no-op outside
    // curated mode / a non-demo cart: the server's curated resolver returns
    // null and cartRecommendations() falls back to its normal algorithmic
    // pick, same as today.
    try {
      const data = await api.cartRecommendations({
        cart: fullCart.map(line => ({ name: line.name, price: line.price, qty: line.quantity })),
        event: event?.type || null,
        mode: table.isLuxury ? 'luxury' : 'standard',
        tableId: table.tableId,
        skip: true,
      });
      setRecData(data);
      const next = data?.recommendations?.[0];
      if (next) {
        setStatusByName(prev => (prev[next.name] ? prev : { ...prev, [next.name]: 'suggested' }));
      }
    } catch { /* keep showing the declined card's terminal state on failure */ }
  }

  // Waiter-side "this table's whole visit is done" -- moves every active
  // order to history and clears the live cart (server: completeTable), so
  // floorService naturally reports the table as free for the next booking.
  async function completeTable() {
    if (!selectedTableId || completing) return;
    if (!window.confirm(`Mark Table ${table.number} as complete? This clears the bill and frees the table for new guests.`)) return;
    setCompleting(true);
    try {
      await api.completeTable(selectedTableId);
      showToast(`Table ${table.number} marked complete`);
      // Bug fix: setTab('tables') alone doesn't change `selectedTableId`, so
      // TableDetails kept rendering the same table with its now-stale
      // order/placedItems (the table looked "complete" on the server but
      // still showed its old items on screen). Re-select the same table --
      // exactly what tapping it from the table list already does -- to reset
      // local state and re-fetch, which now correctly comes back empty.
      selectTable(selectedTableId);
    } catch {
      showToast('Could not complete the table — please try again');
    } finally {
      setCompleting(false);
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
    <div className={`wv-detail ${table.isLuxury ? 'wv-luxury-mode' : ''}`}>
      <header className="wv-detail-head">
        <div>
          <p className="wv-kicker">{table.isLuxury ? 'Luxury Table' : 'Table Details'}</p>
          <h1>{table.isLuxury ? table.displayName : `Table ${table.number}`}</h1>
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
        <InsightTags intel={intel} event={event} cart={fullCart} />
        {recData?.occasionPrompt && <p className="wv-occasion-prompt">🥂 {recData.occasionPrompt}</p>}
        {event?.type === 'birthday' && (
          <button className="wv-secondary full" onClick={requestBirthday} disabled={requestingBirthday}>
            <Gift size={16} /> {requestingBirthday ? 'Requesting...' : 'Request Complimentary Dessert'}
          </button>
        )}
      </section>

      <SeatBreakdown table={table} lines={[...placedItems, ...order]} />

      <AiRecommendationPanel
        key={table.tableId}
        recs={recData?.recommendations || []}
        hasCartItems={fullCart.length > 0}
        onAdd={addRec}
        onDecline={declineRec}
        statusByName={statusByName}
        isLuxury={table.isLuxury}
      />
      <RevenuePanel currentSpend={table.spend + orderTotal} recs={recData?.recommendations || []} opportunity={intel?.opportunity} />

      <div className="wv-quick-actions">
        <button onClick={onAddMode}><Plus size={17} /> Add Item</button>
        <button onClick={() => openOverlay('split')}><SplitSquareHorizontal size={17} /> Split Bill</button>
        <button onClick={() => api.createWaiterTask({ tableId: selectedTableId || '', type: 'manager_request', title: 'Manager Request', message: 'Please visit this table.', priority: 1, waiterName: shift.name }).then(() => showToast('Manager request sent')).catch(() => showToast('Could not send manager request'))}>
          <ShieldAlert size={17} /> Call Manager
        </button>
        <button onClick={() => setTab('chat')}><MessageCircle size={17} /> View Chat</button>
        {(placedItems.length > 0 || table.spend > 0) && (
          <button onClick={completeTable} disabled={completing}>
            <Check size={17} /> {completing ? 'Completing...' : 'Complete Order'}
          </button>
        )}
      </div>

      {order.length > 0 ? (
        <button className="wv-primary sticky" disabled={sending} onClick={sendToKitchen}>
          <Send size={16} /> {sending ? 'Sending...' : 'Send To Kitchen'}
        </button>
      ) : placedItems.length > 0 ? (
        <div className="wv-all-sent sticky"><Check size={15} /> All items sent to kitchen</div>
      ) : null}
    </div>
  );
}

// Falls back to a monogram tile (dish initial on tinted navy) instead of a
// broken-image square whenever resolveThumbnail() can't produce a real photo,
// or the photo it names 404s — this screen was ~95% broken thumbnails before.
// Uses the 300px thumbnail, not the full-res image, for this 52x52 tile.
// resolveVideo() only returns a clip for the 16 reshot dishes (imageResolver's
// ITEM_VIDEO_MAP); every other item gets null and the play affordance below
// never renders for it.
function AddItemThumb({ item }: { item: MenuItem }) {
  const [errored, setErrored] = useState(false);
  const [playing, setPlaying] = useState(false);
  const src = resolveThumbnail(item);
  const videoSrc = resolveVideo(item);

  if (playing && videoSrc) {
    return <video className="wv-item-video" src={videoSrc} muted playsInline autoPlay loop onError={() => setPlaying(false)} />;
  }
  return (
    <>
      {!src || errored ? (
        <span className="wv-item-monogram">{(item.name || '?').trim().charAt(0).toUpperCase()}</span>
      ) : (
        <img src={src} alt="" loading="lazy" onError={() => setErrored(true)} />
      )}
      {videoSrc && (
        <span
          className="wv-item-playbtn"
          role="button"
          tabIndex={0}
          aria-label={`Play ${item.name} video`}
          onClick={e => { e.stopPropagation(); setPlaying(true); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setPlaying(true); } }}
        >
          <Play size={12} fill="currentColor" />
        </span>
      )}
    </>
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
            <span className="wv-item-thumb"><AddItemThumb item={item} /></span>
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
  const { selectedTableId, selectTable, unseenTableUpdates } = useWaiter();
  const { floor, tasks, alerts, loading } = useFloorAndTasks();
  const [subView, setSubView] = useState<TableSubView>('details');
  const [query, setQuery] = useState('');
  const tables = floor?.tables || [];
  const selected = tables.find(table => table.tableId === selectedTableId) || tables.find(t => t.status !== 'empty') || tables[0];
  const filtered = query
    ? tables.filter(table => String(table.number).includes(query) || table.displayName.toLowerCase().includes(query.toLowerCase()))
    : tables;

  useEffect(() => {
    if (!selectedTableId && selected) selectTable(selected.tableId);
  }, [selectTable, selected, selectedTableId]);

  // Bug fix: this used to `return` AddItems in place of everything below,
  // fully UNMOUNTING TableDetails (and with it, the cartRecommendations
  // fetch effect + AiRecommendationPanel it owns) for as long as the waiter
  // was adding items. `order` lives in WaiterContext, not in TableDetails
  // itself, so the cart update from AddItems' addToOrder() was always real
  // and immediate -- but with nothing mounted to react to it, the AI
  // recommendation only ever appeared once TableDetails remounted (tapping
  // "Done"), which happens to be the same screen as "Send To Kitchen". That
  // made it look like recommendations only started once an order was about
  // to be submitted, when the actual fetch had simply never been given the
  // chance to run any sooner. Now TableDetails stays mounted underneath and
  // AddItems renders as an overlay on top of it instead of replacing it, so
  // the recommendation fetch fires the instant an item is tapped in --
  // AddItems itself is unchanged, only how it's composited with the screen
  // beneath it.
  return (
    <main className="wv-screen">
      <label className="wv-search compact">
        <Search size={16} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Jump to table (e.g. 5 or L1)" inputMode="text" />
      </label>
      <div className="wv-mini-table-rail">
        {filtered.map(table => (
          <button
            key={table.tableId}
            className={`${table.tableId === selectedTableId ? 'active' : ''} ${table.isLuxury ? 'wv-luxury' : ''}`}
            onClick={() => selectTable(table.tableId)}
          >
            {unseenTableUpdates.has(table.tableId) && <span className="wv-update-dot" aria-label="New activity" />}
            <b>{table.isLuxury ? table.displayName : table.number}</b>
            <small>{statusCopy(statusForTable(table, alerts, tasks))}</small>
          </button>
        ))}
      </div>
      {selected ? (
        <TableDetails table={selected} onAddMode={() => setSubView('add')} />
      ) : loading ? (
        <div className="wv-empty" style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><Spinner size={28} /></div>
      ) : (
        <p className="wv-empty">No tables loaded.</p>
      )}
      {subView === 'add' && (
        <div className="wv-add-overlay">
          <AddItems onDone={() => setSubView('details')} />
        </div>
      )}
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
            <button className="wv-alert-primary" onClick={() => task.status === 'open' ? ackTask(task.id) : api.resolveWaiterTask(task.id).then(reload)}> {task.status === 'open' ? 'Ack' : 'Resolve'} </button>
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
            <button className="wv-alert-primary" onClick={() => respondAlert(alert.id)}>On my way</button>
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
        <div><span>Guest Rating</span><b className="wv-rating-value">{perf?.guestRating != null ? <>{perf.guestRating}<Star size={15} fill="currentColor" /></> : '—'}</b></div>
        <div><span>Upsell Rate</span><b>{Math.round((perf?.upsellRate || 0) * 100)}%</b></div>
      </div>
      <button className="wv-secondary full" onClick={endShift}>End Shift</button>
      <WaiterOpsSection />
    </main>
  );
}

// Phase 03B — real shift lifecycle + per-table ownership/timeline (consumes the
// Phase 03 staff-ops API). Sits below the demo profile stats.
function WaiterOpsSection() {
  const [tableId, setTableId] = useState('');
  const [active, setActive] = useState('');
  return (
    <div style={{ marginTop: 20 }}>
      <p className="wv-kicker">Shift &amp; ownership</p>
      <ShiftPanel />
      <div className="w-card" style={{ marginTop: 16 }}>
        <span className="w-eyebrow-dim">Table ownership &amp; timeline</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input className="w-field" value={tableId} onChange={e => setTableId(e.target.value)} placeholder="Table id e.g. table1" />
          <button className="w-btn-primary" style={{ width: 'auto', padding: '0 18px' }} disabled={!tableId.trim()} onClick={() => setActive(tableId.trim())}>View</button>
        </div>
        {active && (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <OwnershipPanel tableId={active} />
            <TableTimeline tableId={active} />
          </div>
        )}
      </div>
    </div>
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
