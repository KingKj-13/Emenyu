import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag, Receipt, Heart, Plus } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import { useApp } from '../../context/AppContext';
import { useFavorites } from '../../hooks/useFavorites';
import { useMenu } from '../../hooks/useMenu';
import { api } from '../../services/api';
import { CartItemRow } from './CartItem';
import { CartRecommendations } from './CartRecommendations';
import { TipSelector } from './TipSelector';
import { ReceiptView } from './ReceiptView';
import { flattenMenu, formatPrice, normalizeName } from '../../lib/menuUtils';
import { resolveImage } from '../../lib/imageResolver';
import { Spinner } from '../ui/Spinner';
import type { MenuItem } from '../../types/menu';
import styles from './CartDrawer.module.css';

type CartTab = 'cart' | 'current' | 'favorites';

export function CartDrawer() {
  const {
    items,
    history: currentOrder,
    count,
    isOpen,
    setIsOpen,
    addItem,
    updateQty,
    removeAt,
    setNote,
    setHistory,
    getTotals,
    clear,
  } = useCart();
  const { tableId, setPendingItemName } = useApp();
  const { favorites } = useFavorites();
  const { menuData } = useMenu();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState<CartTab>('cart');
  const [receiptOpen, setReceiptOpen] = useState(false);

  const allMenuItems = useMemo(() => flattenMenu(menuData), [menuData]);
  const favoriteRows = useMemo(() => favorites.map(name => ({
    name,
    item: allMenuItems.find(item => normalizeName(item.name) === normalizeName(name)) ?? null,
  })), [allMenuItems, favorites]);

  function openMenuItem(name: string) {
    setPendingItemName(name);
    setIsOpen(false);
  }

  function addFavoriteToCart(item: MenuItem) {
    addItem({
      name: item.name,
      price: item.price,
      img: resolveImage(item),
      description: item.description || '',
    });
    setTab('cart');
  }

  async function handleSubmit() {
    if (items.length === 0) return;
    setSubmitting(true);
    const orderedItems = items.map(item => ({ ...item }));

    try {
      await api.submitOrder({
        items: orderedItems.map(i => ({
          name: i.name,
          price: i.price,
          qty: i.qty,
          note: i.note,
          img: i.img,
          description: i.description,
        })),
        table_number: tableId,
      });
      setHistory([...currentOrder, ...orderedItems]);
      clear();
      setTab('current');
      setSubmitted(true);
      setTimeout(() => { setSubmitted(false); }, 1600);
    } catch {
      alert('Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const totals = getTotals();

  return (
    <>
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
                  {tab === 'cart' ? `Your Cart (${count})` : tab === 'current' ? 'Current Order' : 'Favorites'}
                </h2>
                <div className={styles.tabs}>
                  <button className={`${styles.tab} ${tab === 'cart' ? styles.tabActive : ''}`} onClick={() => setTab('cart')}>Cart</button>
                  <button className={`${styles.tab} ${tab === 'current' ? styles.tabActive : ''}`} onClick={() => setTab('current')}>Current Order</button>
                  <button className={`${styles.tab} ${tab === 'favorites' ? styles.tabActive : ''}`} onClick={() => setTab('favorites')} aria-label="Favorites">
                    <Heart size={13} />
                  </button>
                </div>
                <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label="Close cart">
                  <X size={20} />
                </button>
              </div>

              <div className={styles.body}>
                {submitted ? (
                  <div className={styles.successMsg}>
                    <div className={styles.successIcon}>OK</div>
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
                ) : tab === 'current' ? (
                  <div className={styles.items}>
                    {currentOrder.length === 0 ? (
                      <div className={styles.empty}>
                        <p>No current order for this table yet.</p>
                      </div>
                    ) : (
                      currentOrder.map((item, i) => (
                        <div key={`${item.name}-${i}`} className={styles.historyItem}>
                          {item.img && <img src={item.img} alt={item.name} className={styles.historyThumb} loading="lazy" />}
                          <div className={styles.historyMeta}>
                            <span className={styles.historyName}>{item.name}</span>
                            {item.note && <span className={styles.historyNote}>{item.note}</span>}
                          </div>
                          <span className={styles.historyQty}>x{item.qty}</span>
                          <span className={styles.historyPrice}>{formatPrice(item.price * item.qty)}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className={styles.items}>
                    {favoriteRows.length === 0 ? (
                      <div className={styles.empty}>
                        <Heart size={42} className={styles.emptyIcon} />
                        <p>Your favorite dishes will appear here.</p>
                      </div>
                    ) : (
                      favoriteRows.map(({ name, item }) => (
                        <div key={name} className={styles.favoriteItem}>
                          {item && <img src={resolveImage(item)} alt={item.name} className={styles.historyThumb} loading="lazy" />}
                          <button className={styles.favoriteMain} onClick={() => openMenuItem(name)}>
                            <span className={styles.historyName}>{item?.name || name}</span>
                            {item?.price ? <span className={styles.favoritePrice}>{formatPrice(item.price)}</span> : null}
                          </button>
                          {item && (
                            <button className={styles.favoriteAdd} onClick={() => addFavoriteToCart(item)} aria-label={`Add ${item.name} to cart`}>
                              <Plus size={14} />
                            </button>
                          )}
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
              {currentOrder.length > 0 && !submitted && (
                <div className={styles.billFooter}>
                  <button className={styles.billBtn} onClick={() => setReceiptOpen(true)}>
                    <Receipt size={14} />
                    View Bill
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      {receiptOpen && (
        <ReceiptView
          tableId={tableId || 'table1'}
          items={currentOrder}
          onClose={() => setReceiptOpen(false)}
        />
      )}
    </>
  );
}
