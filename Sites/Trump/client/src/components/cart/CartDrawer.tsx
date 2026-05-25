import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { CartItemRow } from './CartItem';
import { CartRecommendations } from './CartRecommendations';
import { TipSelector } from './TipSelector';
import { formatPrice } from '../../lib/menuUtils';
import { Spinner } from '../ui/Spinner';
import { useState } from 'react';
import styles from './CartDrawer.module.css';

export function CartDrawer() {
  const { items, history, count, isOpen, setIsOpen, updateQty, removeAt, setNote, getTotals, tipMode, customTip, clear } = useCart();
  const { tableId } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState<'cart' | 'history'>('cart');

  async function handleSubmit() {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      await api.submitOrder({
        items: items.map(i => ({ name: i.name, price: i.price, qty: i.qty, note: i.note })),
        table_number: tableId,
      });
      clear();
      setSubmitted(true);
      setTimeout(() => { setSubmitted(false); setIsOpen(false); }, 2200);
    } catch (err) {
      alert('Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
            onClick={() => setIsOpen(false)}
          />
          <motion.aside
            className={styles.drawer}
            role="dialog"
            aria-label="Your cart"
            aria-modal="true"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>
                <ShoppingBag size={20} />
                {tab === 'cart' ? `Your Order (${count})` : 'Order History'}
              </h2>
              <div className={styles.tabs}>
                <button className={`${styles.tab} ${tab === 'cart' ? styles.tabActive : ''}`} onClick={() => setTab('cart')}>Cart</button>
                <button className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`} onClick={() => setTab('history')}>History</button>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label="Close cart">
                <X size={20} />
              </button>
            </div>

            <div className={styles.body}>
              {submitted ? (
                <div className={styles.successMsg}>
                  <div className={styles.successIcon}>✓</div>
                  <p>Order placed successfully!</p>
                  <p className={styles.successSub}>Your waiter has been notified.</p>
                </div>
              ) : tab === 'cart' ? (
                <>
                  {items.length === 0 ? (
                    <div className={styles.empty}>
                      <ShoppingBag size={48} className={styles.emptyIcon} />
                      <p>Your cart is empty</p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.items}>
                        {items.map((item, i) => (
                          <CartItemRow
                            key={`${item.name}-${i}`}
                            item={item}
                            index={i}
                            onUpdateQty={updateQty}
                            onRemove={removeAt}
                            onNoteChange={setNote}
                          />
                        ))}
                      </div>

                      <CartRecommendations cartItems={items} />

                      <TipSelector />

                      <div className={styles.totals}>
                        <div className={styles.totalRow}>
                          <span>Subtotal</span>
                          <span>{formatPrice(totals.subtotal)}</span>
                        </div>
                        <div className={styles.totalRow}>
                          <span>VAT (15%)</span>
                          <span>{formatPrice(totals.vat)}</span>
                        </div>
                        <div className={styles.totalRow}>
                          <span>Service (5%)</span>
                          <span>{formatPrice(totals.service)}</span>
                        </div>
                        {totals.tip > 0 && (
                          <div className={styles.totalRow}>
                            <span>Tip</span>
                            <span>{formatPrice(totals.tip)}</span>
                          </div>
                        )}
                        <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                          <span>Total</span>
                          <span>{formatPrice(totals.total)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className={styles.items}>
                  {history.length === 0 ? (
                    <div className={styles.empty}>
                      <p>No previous orders this session.</p>
                    </div>
                  ) : (
                    history.map((item, i) => (
                      <div key={i} className={styles.historyItem}>
                        <span className={styles.historyName}>{item.name}</span>
                        <span className={styles.historyQty}>×{item.qty}</span>
                        <span className={styles.historyPrice}>{formatPrice(item.price * item.qty)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {tab === 'cart' && items.length > 0 && !submitted && (
              <div className={styles.footer}>
                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={submitting}
                  aria-label="Place order"
                >
                  {submitting ? <Spinner size={18} /> : 'Place Order'}
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
