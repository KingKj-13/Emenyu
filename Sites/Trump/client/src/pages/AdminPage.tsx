import { useState, useEffect } from 'react';
import { ClipboardList, BookOpen, Users, MessageSquare, LogOut, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Spinner } from '../components/ui/Spinner';
import { formatPrice } from '../lib/menuUtils';
import styles from './AdminPage.module.css';

type Tab = 'orders' | 'history' | 'accounts' | 'chat';

interface Order {
  filename: string;
  tableId?: string;
  table_number?: string;
  timestamp?: string;
  items?: Array<{ name: string; price: number; qty: number }>;
  total?: number;
  subtotal?: number;
}

export function AdminPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<unknown[]>([]);
  const [chatLogs, setChatLogs] = useState<unknown[]>([]);
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

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
  ];

  return (
    <AppShell requireRole={['owner', 'manager']}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Admin Dashboard</h1>
            <p className={styles.pageSubtitle}>{user?.label || user?.username} · {user?.role}</p>
          </div>
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
