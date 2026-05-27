import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, LogOut, CheckCircle, Plus, AlertCircle, Bell } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { useSocketEvent } from '../hooks/useSocket';
import { useMenuData } from '../context/MenuContext';
import { flattenMenu, formatPrice } from '../lib/menuUtils';
import { resolveImage } from '../lib/imageResolver';
import { Spinner } from '../components/ui/Spinner';
import type { MenuItem } from '../types/menu';
import styles from './WaiterPage.module.css';

const TABLE_IDS = Array.from({ length: 15 }, (_, i) => `table${i + 1}`);

interface TableStatus {
  status: 'active' | 'empty';
  orderCount?: number;
  total?: number;
  oldestOrderAt?: string;
}

export function WaiterPage() {
  const { user, logout } = useAuth();
  const { menuData } = useMenuData();
  const [tableStatuses, setTableStatuses] = useState<Record<string, TableStatus>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [addingItems, setAddingItems] = useState<MenuItem[]>([]);
  const [waiterNote, setWaiterNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allItems = flattenMenu(menuData);

  async function loadStatuses() {
    setLoading(true);
    const statuses: Record<string, TableStatus> = {};
    await Promise.allSettled(
      TABLE_IDS.map(async id => {
        try {
          const s = await api.waiterTableStatus(id) as TableStatus;
          statuses[id] = s;
        } catch {
          statuses[id] = { status: 'empty' };
        }
      })
    );
    setTableStatuses(statuses);
    setLoading(false);
  }

  useEffect(() => { loadStatuses(); }, []);

  const handleOrderEvent = useCallback(() => { loadStatuses(); }, []);
  useSocketEvent('orderPlaced', handleOrderEvent);
  useSocketEvent('orderUpdated', handleOrderEvent);
  useSocketEvent<{ orderId: number; kitchenStatus: string }>('kitchenStatusUpdate', handleOrderEvent);

  async function handleArchive(tableId: string) {
    if (!confirm(`Archive all orders for ${tableId}?`)) return;
    try {
      await api.waiterArchiveTable({ tableId, restaurantId: 'trump' });
      await loadStatuses();
    } catch {}
  }

  async function handleAddItems() {
    if (!selectedTable || addingItems.length === 0) return;
    setSubmitting(true);
    try {
      await api.waiterAddItems({
        tableId: selectedTable,
        items: addingItems.map(i => ({ name: i.name, price: i.price, qty: 1 })),
        waiterName: user?.username || 'waiter',
        notes: waiterNote,
      });
      setAddingItems([]);
      setWaiterNote('');
      setSelectedTable(null);
      await loadStatuses();
    } catch {}
    setSubmitting(false);
  }

  return (
    <AppShell requireRole={['owner', 'manager', 'waiter']}>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Waiter Dashboard</h1>
            <p className={styles.pageSubtitle}>{user?.label || user?.username}</p>
          </div>
          <div className={styles.headerActions}>
            <WaiterNotificationButton />
            <button className={styles.refreshBtn} onClick={loadStatuses} aria-label="Refresh">
              <RefreshCw size={15} />
            </button>
            <button className={styles.logoutBtn} onClick={logout}>
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingState}><Spinner size={36} /></div>
        ) : (
          <div className={styles.tableGrid}>
            {TABLE_IDS.map(id => {
              const status = tableStatuses[id] || { status: 'empty' };
              const waitingMins = status.oldestOrderAt
                ? (Date.now() - new Date(status.oldestOrderAt).getTime()) / 60000
                : 0;
              const isWaiting = waitingMins > 20;
              return (
                <div
                  key={id}
                  className={`${styles.tableCard} ${status.status === 'active' ? styles.tableActive : ''} ${isWaiting ? styles.tableWaiting : ''}`}
                >
                  <div className={styles.tableCardHeader}>
                    <span className={styles.tableId}>{id.replace('table', 'Table ')}</span>
                    <div className={styles.tableStatusRow}>
                      {isWaiting && (
                        <span className={styles.waitingBadge} title={`Waiting ${Math.floor(waitingMins)} min`}>
                          <AlertCircle size={11} />
                          {Math.floor(waitingMins)}m
                        </span>
                      )}
                      <span className={`${styles.tableStatus} ${status.status === 'active' ? styles.statusActive : styles.statusEmpty}`}>
                        {status.status === 'active' ? 'Active' : 'Empty'}
                      </span>
                    </div>
                  </div>

                  {status.status === 'active' && (
                    <div className={styles.tableInfo}>
                      {status.orderCount !== undefined && (
                        <span>{status.orderCount} order{status.orderCount !== 1 ? 's' : ''}</span>
                      )}
                      {status.total !== undefined && (
                        <span className={styles.tableTotal}>{formatPrice(status.total)}</span>
                      )}
                    </div>
                  )}

                  <div className={styles.tableActions}>
                    <button
                      className={styles.addItemsBtn}
                      onClick={() => setSelectedTable(id)}
                    >
                      <Plus size={14} />
                      Add Items
                    </button>
                    {status.status === 'active' && (
                      <button
                        className={styles.archiveBtn}
                        onClick={() => handleArchive(id)}
                      >
                        <CheckCircle size={14} />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Items Panel */}
        {selectedTable && (
          <div className={styles.addPanel}>
            <div className={styles.addPanelHeader}>
              <h3>Add Items to {selectedTable.replace('table', 'Table ')}</h3>
              <button onClick={() => { setSelectedTable(null); setAddingItems([]); }}>✕</button>
            </div>

            <div className={styles.itemSearch}>
              {addingItems.length > 0 && (
                <div className={styles.selectedItems}>
                  <p className={styles.selectedLabel}>Selected items:</p>
                  {addingItems.map((item, i) => (
                    <div key={i} className={styles.selectedItem}>
                      <span>{item.name}</span>
                      <span>{formatPrice(item.price)}</span>
                      <button onClick={() => setAddingItems(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="text"
                className={styles.noteInput}
                placeholder="Table notes (optional)…"
                value={waiterNote}
                onChange={e => setWaiterNote(e.target.value)}
              />

              <button
                className={styles.submitAddBtn}
                onClick={handleAddItems}
                disabled={addingItems.length === 0 || submitting}
              >
                {submitting ? <Spinner size={16} /> : `Add ${addingItems.length} item${addingItems.length !== 1 ? 's' : ''}`}
              </button>
            </div>

            <div className={styles.menuPicker}>
              {allItems.slice(0, 40).map((item, i) => (
                <button
                  key={i}
                  className={styles.pickerItem}
                  onClick={() => setAddingItems(prev => [...prev, item])}
                >
                  {item.img && (
                    <img src={resolveImage(item)} alt={item.name} className={styles.pickerThumb} />
                  )}
                  <div className={styles.pickerInfo}>
                    <span className={styles.pickerName}>{item.name}</span>
                    <span className={styles.pickerPrice}>{formatPrice(item.price)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function WaiterNotificationButton() {
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

  if (status === 'subscribed') return <span className={styles.notifActive}><Bell size={13} /></span>;
  if (status === 'denied') return null;
  return (
    <button className={styles.notifBtn} onClick={handleEnable} disabled={status === 'loading'} title="Enable push notifications">
      <Bell size={14} />
    </button>
  );
}
