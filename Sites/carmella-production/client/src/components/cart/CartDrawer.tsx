import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag, Trash2, Split } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import { CartItemRow } from './CartItem';
import { SplitBillModal } from './SplitBillModal';
import { formatPrice } from '../../lib/menuUtils';
import type { DeviceCartGroup } from '../../types/cart';
import styles from './CartDrawer.module.css';

export function CartDrawer() {
  const { items, count, isOpen, setIsOpen, updateQty, removeAt, setNote, getTotals, clearMine, mine, others } = useCart();
  const [splitBillOpen, setSplitBillOpen] = useState(false);

  function closeDrawer() {
    setIsOpen(false);
  }

  const totals = getTotals();

  // Every device's items are drawn from the SAME underlying `items` array, so
  // `items.indexOf(item)` recovers the correct global index for the
  // qty/remove/note mutations, which all operate by index into that array.
  function renderGroup(group: DeviceCartGroup, isMine: boolean) {
    if (!isMine && group.items.length === 0) return null;
    return (
      <div className={styles.deviceGroup} key={group.deviceId ?? (isMine ? 'mine' : 'unassigned')}>
        <div className={styles.deviceGroupHeader}>
          <span>{group.label}</span>
          <span className={styles.deviceGroupSubtotal}>{formatPrice(group.subtotal)}</span>
        </div>
        {group.items.length === 0 ? (
          <p className={styles.deviceGroupEmpty}>No items yet</p>
        ) : (
          <div className={styles.items}>
            {group.items.map(item => {
              const index = items.indexOf(item);
              return (
                <CartItemRow
                  key={`${item.name}-${item.price}-${index}`}
                  item={item}
                  index={index}
                  onUpdateQty={updateQty}
                  onRemove={removeAt}
                  onNoteChange={setNote}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={closeDrawer}
          />
          <motion.aside
            className={styles.drawer}
            role="dialog"
            aria-label="Shared cart"
            aria-modal="true"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>
                <ShoppingBag size={20} />
                Shared Cart ({count})
              </h2>
              <button className={styles.closeBtn} onClick={closeDrawer} aria-label="Close cart">
                <X size={20} />
              </button>
            </div>

            <div className={styles.body}>
              {items.length === 0 ? (
                <div className={styles.empty}>
                  <ShoppingBag size={48} className={styles.emptyIcon} />
                  <p>Your cart is empty</p>
                  <button className={styles.emptyBrowseBtn} onClick={() => setIsOpen(false)}>
                    Browse the Menu
                  </button>
                </div>
              ) : (
                <>
                  {renderGroup(mine, true)}
                  {others.map(group => renderGroup(group, false))}

                  <div className={styles.totals}>
                    <div className={styles.totalRow}>
                      <span>Table Total</span>
                      <span>{formatPrice(totals.subtotal)}</span>
                    </div>
                    <div className={styles.totalRow}>
                      <span>VAT</span>
                      <span>{formatPrice(totals.vat)}</span>
                    </div>
                    <div className={styles.totalRow}>
                      <span>Service charge</span>
                      <span>{formatPrice(totals.service)}</span>
                    </div>
                    <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                      <span>Grand Total</span>
                      <span>{formatPrice(totals.total)}</span>
                    </div>
                    <p className={styles.estimateNote}>
                      This is an estimate for your own reference — please place your order with your host.
                    </p>
                  </div>
                </>
              )}
            </div>

            {items.length > 0 && (
              <div className={styles.footer}>
                <div className={styles.billActions}>
                  <button className={styles.splitBtn} onClick={() => setSplitBillOpen(true)}>
                    <Split size={14} /> Split Bill
                  </button>
                  <button className={styles.futureBtn} disabled aria-label="Pay My Items — coming soon">
                    Pay My Items<span className={styles.soonBadge}>Soon</span>
                  </button>
                  <button className={styles.futureBtn} disabled aria-label="Merge Bills — coming soon">
                    Merge Bills<span className={styles.soonBadge}>Soon</span>
                  </button>
                </div>
                {mine.items.length > 0 && (
                  <button className={styles.clearBtn} onClick={clearMine} aria-label="Clear my items">
                    <Trash2 size={15} /> Clear My Items
                  </button>
                )}
              </div>
            )}
          </motion.aside>

          <SplitBillModal open={splitBillOpen} onClose={() => setSplitBillOpen(false)} />
        </>
      )}
    </AnimatePresence>
  );
}
