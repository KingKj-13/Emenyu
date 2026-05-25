import { useState, useEffect } from 'react';
import { RefreshCw, LogOut, CheckCircle, Plus } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { useMenuData } from '../context/MenuContext';
import { flattenMenu, formatPrice } from '../lib/menuUtils';
import { resolveImage } from '../lib/imageResolver';
import { Spinner } from '../components/ui/Spinner';
import type { MenuItem } from '../types/menu';
import styles from './WaiterPage.module.css';

const TABLE_IDS = ['table1','table2','table3','table4','table5','table6','table7','table8'];

interface TableStatus {
  status: 'active' | 'empty';
  orderCount?: number;
  total?: number;
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
              return (
                <div
                  key={id}
                  className={`${styles.tableCard} ${status.status === 'active' ? styles.tableActive : ''}`}
                >
                  <div className={styles.tableCardHeader}>
                    <span className={styles.tableId}>{id.replace('table', 'Table ')}</span>
                    <span className={`${styles.tableStatus} ${status.status === 'active' ? styles.statusActive : styles.statusEmpty}`}>
                      {status.status === 'active' ? 'Active' : 'Empty'}
                    </span>
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
