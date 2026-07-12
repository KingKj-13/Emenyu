import { useMemo, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShoppingBag, Receipt, Heart, Plus, Check } from 'lucide-react';
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
import { resolveImage, resolveThumbnail, FALLBACK_IMAGE } from '../../lib/imageResolver';
import { trackOrdered } from '../../lib/recoAnalytics';
import { Spinner } from '../ui/Spinner';
import type { MenuItem } from '../../types/menu';
import type { CartItem } from '../../types/cart';
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
  const [lastOrder, setLastOrder] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<CartTab>('cart');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  // Reopening the drawer with items in the cart should always land on the Cart
  // tab — otherwise a repeat order (add an item after checking out earlier)
  // silently opens on the stale "Current Order" tab with the new item hidden.
  useEffect(() => {
    if (isOpen && items.length > 0) setTab('cart');
    // Only when the drawer transitions open — not on every cart edit while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const allMenuItems = useMemo(() => flattenMenu(menuData), [menuData]);
  const favoriteRows = useMemo(() => favorites.map(name => ({
    name,
    item: allMenuItems.find(item => normalizeName(item.name) === normalizeName(name)) ?? null,
  })), [allMenuItems, favorites]);

  function openMenuItem(name: string) {
    setPendingItemName(name);
    setIsOpen(false);
  }

  function closeDrawer() {
    setIsOpen(false);
    setSubmitted(false);
  }

  function switchTab(next: CartTab) {
    setTab(next);
    setSubmitted(false);
  }

  function addFavoriteToCart(item: MenuItem) {
    addItem({
      name: item.name,
      price: item.price,
      img: resolveImage(item),
      description: item.description || '',
      categoryType: item.categoryType,
      beverageKind: item.beverageKind,
    });
    setTab('cart');
  }

  async function handleSubmit() {
    if (items.length === 0) return;
    setSubmitting(true);
    setSubmitError(false);
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
        // Was omitted entirely -- server reads totals.tip as the customer's
        // chosen tip (clamped server-side) and silently zeroes it when this
        // is absent, so every order was losing its selected tip.
        totals,
      });
      // Phase 4: attribute "ordered" events to any recommendations accepted this session.
      trackOrdered(orderedItems.map(i => i.name));
      setHistory([...currentOrder, ...orderedItems]);
      setLastOrder(orderedItems);
      clear();
      setTab('current');
      setSubmitted(true);
    } catch {
      setSubmitError(true);
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
              // Bug #4, real root cause (confirmed via 6 live runs, including a
              // fresh page with zero prior overlay interaction): this was never
              // a positioning bug or an animation-interruption race with the
              // item modal/hamburger drawer -- it's simply that this spring
              // (damping:28, stiffness:280) has a slow ramp-up and takes ~600ms
              // to visually settle, during which the drawer is genuinely,
              // severely off-screen (~97% off-screen at 70ms, ~85% at 175ms).
              // Anyone who looks at the screen (or a screenshot) in that window
              // sees exactly "almost entirely off the right edge" -- not a
              // glitch, just this spring's own opening curve, 100% reproducible
              // every time. A short, fixed-duration tween settles fast and
              // predictably instead, and matches the backdrop's own 0.22s fade
              // (previously the backdrop looked "done" ~400ms before the
              // drawer caught up, which read as janky/broken on its own).
              transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.drawerHeader}>
                <h2 className={styles.drawerTitle}>
                  <ShoppingBag size={20} />
                  {tab === 'cart' ? `Your Cart (${count})` : tab === 'current' ? 'Current Order' : 'Favorites'}
                </h2>
                <div className={styles.tabs}>
                  <button className={`${styles.tab} ${tab === 'cart' ? styles.tabActive : ''}`} onClick={() => switchTab('cart')}>Cart</button>
                  <button className={`${styles.tab} ${tab === 'current' ? styles.tabActive : ''}`} onClick={() => switchTab('current')}>Current Order</button>
                  <button className={`${styles.tab} ${tab === 'favorites' ? styles.tabActive : ''}`} onClick={() => switchTab('favorites')} aria-label="Favorites">
                    <Heart size={13} />
                  </button>
                </div>
                <button className={styles.closeBtn} onClick={closeDrawer} aria-label="Close cart">
                  <X size={20} />
                </button>
              </div>

              <div className={styles.body}>
                {submitted ? (
                  <div className={styles.successMsg}>
                    <motion.div
                      className={styles.successIcon}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    >
                      <Check size={30} strokeWidth={3} />
                    </motion.div>
                    <p className={styles.successTitle}>Order placed successfully!</p>
                    <p className={styles.successSub}>Your waiter has been notified.</p>
                    <p className={styles.successEta}>Most dishes are ready in 15–20 minutes.</p>
                    {lastOrder.length > 0 && (
                      <div className={styles.successSummary}>
                        {lastOrder.map((item, i) => (
                          <div key={`${item.name}-${i}`} className={styles.successSummaryRow}>
                            <span>{item.qty}× {item.name}</span>
                            <span>{formatPrice(item.price * item.qty)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className={styles.emptyBrowseBtn} onClick={closeDrawer}>
                      Continue Browsing
                    </button>
                  </div>
                ) : tab === 'cart' ? (
                  <>
                    {items.length === 0 ? (
                      <div className={styles.empty}>
                        <ShoppingBag size={48} className={styles.emptyIcon} />
                        <p>Your cart is empty</p>
                        <p className={styles.emptyBrand}>Your table awaits its first course.</p>
                        <button className={styles.emptyBrowseBtn} onClick={() => setIsOpen(false)}>
                          Browse the Menu
                        </button>
                        {currentOrder.length > 0 && (
                          <button className={styles.emptyBillLink} onClick={() => setReceiptOpen(true)}>
                            <Receipt size={12} /> View Bill
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className={styles.items}>
                          {items.map((item, i) => (
                            <CartItemRow
                              // Name+price alone is already a stable, unique key: addItem
                              // merges any add matching an existing name+price into that
                              // line (qty++) rather than creating a second line, so within
                              // one cart no two lines can share it. Index alone (the old
                              // key) shifts for every row after a removed one, forcing
                              // React to remount those rows instead of updating in place --
                              // that remount was the visible "glitch" on remove/reorder.
                              key={`${item.name}-${item.price}`}
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
                      currentOrder.map((item, i) => {
                        const imgSrc = resolveThumbnail({ name: item.name, price: item.price, description: item.description, img: item.img });
                        return (
                          <div key={`${item.name}-${i}`} className={styles.historyItem}>
                            {imgSrc && (
                              <img
                                src={imgSrc}
                                alt={item.name}
                                className={styles.historyThumb}
                                loading="lazy"
                                onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }}
                              />
                            )}
                            <div className={styles.historyMeta}>
                              <span className={styles.historyName}>{item.name}</span>
                              {item.note && <span className={styles.historyNote}>{item.note}</span>}
                            </div>
                            <span className={styles.historyQty}>x{item.qty}</span>
                            <span className={styles.historyPrice}>{formatPrice(item.price * item.qty)}</span>
                          </div>
                        );
                      })
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
                          {item && <img src={resolveThumbnail(item)} alt={item.name} className={styles.historyThumb} loading="lazy" />}
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
                  {submitError && (
                    <p className={styles.submitErrorMsg} role="alert">
                      Couldn't place your order — please try again.
                    </p>
                  )}
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
              {currentOrder.length > 0 && !submitted && !(tab === 'cart' && items.length === 0) && (
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
