import { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, Volume2, VolumeX } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../hooks/useAuth';
import { useSocketEvent } from '../hooks/useSocket';
import { api } from '../services/api';
import { Spinner } from '../components/ui/Spinner';
import { RESTAURANT_ID } from '../constants/api';
import { getSocket } from '../services/socket';
import styles from './KitchenPage.module.css';

const STATUS_ORDER = ['new', 'preparing', 'ready'] as const;
type KitchenStatus = typeof STATUS_ORDER[number];

interface OrderItem { id: number; name: string; quantity: number; note: string; }
interface KitchenOrder {
  id: number;
  tableId: string;
  kitchenStatus: KitchenStatus;
  timestamp: string;
  total: number;
  items: OrderItem[];
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(Date.now() - new Date(since).getTime());

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - new Date(since).getTime()), 1000);
    return () => clearInterval(t);
  }, [since]);

  const mins = elapsed / 60000;
  const cls = mins > 15 ? styles.timeOverdue : mins > 8 ? styles.timeWarning : styles.timeNormal;
  return <span className={`${styles.timeElapsed} ${cls}`}>{formatElapsed(elapsed)}</span>;
}

const NEXT_STATUS: Record<KitchenStatus, KitchenStatus | 'served'> = {
  new: 'preparing',
  preparing: 'ready',
  ready: 'served'
};

const COL_LABEL: Record<KitchenStatus, string> = {
  new: 'New Orders',
  preparing: 'Preparing',
  ready: 'Ready'
};

const COL_BTN_LABEL: Record<KitchenStatus, string> = {
  new: 'Start Preparing →',
  preparing: 'Mark Ready ✓',
  ready: 'Served — Complete ✓'
};

export function KitchenPage() {
  const { logout } = useAuth();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);

  function playChime() {
    if (!soundOn) return;
    try {
      const ctx = audioRef.current || (audioRef.current = new AudioContext());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  }

  async function loadOrders() {
    try {
      const data = await api.getKitchenOrders() as KitchenOrder[];
      setOrders(data.filter(o => (o.kitchenStatus as string) !== 'served'));
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    const socket = getSocket();
    socket.emit('joinKitchen', { restaurantId: RESTAURANT_ID });
  }, []);

  useSocketEvent<{ order: KitchenOrder }>('orderPlaced', useCallback(({ order }) => {
    setOrders(prev => {
      if (prev.find(o => o.id === order.id)) return prev;
      return [...prev, { ...order, kitchenStatus: 'new' }];
    });
    playChime();
  }, [soundOn]));

  useSocketEvent<{ orderId: number; kitchenStatus: string; order: KitchenOrder }>('kitchenStatusUpdate', useCallback(({ orderId, kitchenStatus, order }) => {
    if (kitchenStatus === 'served') {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      return;
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, kitchenStatus: kitchenStatus as KitchenStatus, ...(order || {}) } : o));
  }, []));

  useSocketEvent('adminResetTable', useCallback(() => {
    loadOrders();
  }, []));

  async function advance(order: KitchenOrder) {
    const next = NEXT_STATUS[order.kitchenStatus];
    try {
      await api.updateKitchenStatus(order.id, next);
      if (next === 'served') {
        setOrders(prev => prev.filter(o => o.id !== order.id));
      } else {
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, kitchenStatus: next as KitchenStatus } : o));
      }
    } catch {}
  }

  const byStatus = (status: KitchenStatus) => orders.filter(o => o.kitchenStatus === status);

  return (
    <AppShell requireRole={['owner', 'manager', 'kitchen']} hideHeader>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Kitchen Display</h1>
            <div className={styles.liveTag}>
              <span className={styles.liveDot} />
              Live
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              className={`${styles.soundToggle} ${soundOn ? styles.on : ''}`}
              onClick={() => setSoundOn(v => !v)}
              title="Toggle chime"
            >
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {soundOn ? 'Sound on' : 'Sound off'}
            </button>
            <button className={styles.logoutBtn} onClick={logout}>
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}><Spinner size={40} /></div>
        ) : (
          <div className={styles.columns}>
            {STATUS_ORDER.map(status => {
              const col = byStatus(status);
              const colCls = status === 'new' ? styles.colNew : status === 'preparing' ? styles.colPreparing : styles.colReady;
              return (
                <div key={status} className={styles.column}>
                  <div className={`${styles.columnHeader} ${colCls}`}>
                    {COL_LABEL[status]}
                    <span className={styles.columnCount}>{col.length}</span>
                  </div>

                  {col.length === 0 ? (
                    <div className={styles.emptyCol}>No orders</div>
                  ) : col.map(order => {
                    const minsOld = (Date.now() - new Date(order.timestamp).getTime()) / 60000;
                    const cardCls = status === 'new' ? styles.cardNew : status === 'preparing' ? styles.cardPreparing : styles.cardReady;
                    const btnCls = status === 'new' ? styles.btnNew : status === 'preparing' ? styles.btnPreparing : styles.btnReady;
                    return (
                      <div
                        key={order.id}
                        className={`${styles.orderCard} ${cardCls} ${minsOld > 15 ? styles.cardOverdue : ''}`}
                      >
                        <div className={styles.cardHeader}>
                          <span className={styles.tableLabel}>
                            {order.tableId.replace(/^table/, 'Table ')}
                          </span>
                          <div className={styles.cardMeta}>
                            <ElapsedTimer since={order.timestamp} />
                            <span className={styles.orderTotal}>
                              R {(order.total || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className={styles.itemsList}>
                          {(order.items || []).map(item => (
                            <div key={item.id} className={styles.orderItem}>
                              <div>
                                <span className={styles.itemName}>{item.name}</span>
                                {item.note && <div className={styles.itemNote}>{item.note}</div>}
                              </div>
                              <span className={styles.itemQty}>×{item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <button
                          className={`${styles.actionBtn} ${btnCls}`}
                          onClick={() => advance(order)}
                        >
                          {COL_BTN_LABEL[status]}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
