import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import { CartItemRow } from './CartItem';
import { formatPrice } from '../../lib/menuUtils';
import styles from './CartDrawer.module.css';

export function CartDrawer() {
  const { items, count, isOpen, setIsOpen, updateQty, removeAt, setNote, getTotals, clear } = useCart();

  function closeDrawer() {
    setIsOpen(false);
  }

  const totals = getTotals();

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
            aria-label="Your cart"
            aria-modal="true"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>
                <ShoppingBag size={20} />
                Your Cart ({count})
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
                  <div className={styles.items}>
                    {items.map((item, i) => (
                      <CartItemRow
                        key={`${item.name}-${item.price}`}
                        item={item}
                        index={i}
                        onUpdateQty={updateQty}
                        onRemove={removeAt}
                        onNoteChange={setNote}
                      />
                    ))}
                  </div>

                  <div className={styles.totals}>
                    <div className={styles.totalRow}>
                      <span>Subtotal</span>
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
                      <span>Estimated total</span>
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
                <button className={styles.clearBtn} onClick={clear} aria-label="Clear cart">
                  <Trash2 size={15} /> Clear cart
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
