import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useApp } from '../context/AppContext';
import { useFavorites } from '../hooks/useFavorites';
import { useMenu } from '../hooks/useMenu';
import { api } from '../services/api';
import { flattenMenu, formatPrice, normalizeName } from '../lib/menuUtils';
import { resolveImage, resolveThumbnail, FALLBACK_IMAGE } from '../lib/imageResolver';
import { trackOrdered } from '../lib/recoAnalytics';
import { getSessionId } from '../lib/engagement';
import { Spinner } from '../components/ui/Spinner';
import { PremiumCartItem } from './cart/PremiumCartItem';
import { PremiumTipSelector } from './cart/PremiumTipSelector';
import { PremiumReceiptView } from './cart/PremiumReceiptView';
import type { MenuItem } from '../types/menu';
import type { CartItem } from '../types/cart';
import styles from './PremiumCartSheet.module.css';

type CartTab = 'cart' | 'current' | 'favorites';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PremiumCartSheet({ open, onClose }: Props) {
  const {
    items, history: currentOrder, count, addItem, updateQty, removeAt, setNote,
    setHistory, getTotals, clear, tableDevices, recommendations: recs, recommendationsLoading,
  } = useCart();
  const { tableId, tableLabel, device, setPendingItemName } = useApp();
  const { favorites } = useFavorites();
  const { menuData } = useMenu();

  const [tab, setTab] = useState<CartTab>('cart');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [lastOrder, setLastOrder] = useState<CartItem[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [recIndex, setRecIndex] = useState(0);
  const pendingOrderId = useRef<string | null>(null);

  useEffect(() => {
    if (open && items.length > 0) setTab('cart');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setRecIndex(0); }, [recs]);

  const allMenuItems = useMemo(() => flattenMenu(menuData), [menuData]);

  const distinctDevices = useMemo(
    () => new Set(items.map(i => i.addedByDevice).filter(Boolean)),
    [items]
  );
  const showGuestLabels = distinctDevices.size > 1;
  function guestLabelFor(deviceId?: string): string | undefined {
    if (!showGuestLabels || !deviceId) return undefined;
    if (deviceId === device.deviceId) return 'You';
    return tableDevices.find(d => d.deviceId === deviceId)?.label || 'Guest';
  }

  const favoriteRows = useMemo(() => favorites.map(name => ({
    name,
    item: allMenuItems.find(item => normalizeName(item.name) === normalizeName(name)) ?? null,
  })), [allMenuItems, favorites]);

  function openMenuItem(name: string) {
    setPendingItemName(name);
    onClose();
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

  const totals = getTotals();

  async function handleSubmit() {
    if (items.length === 0) return;
    setSubmitting(true);
    setSubmitError(false);
    const orderedItems = items.map(item => ({ ...item }));
    if (!pendingOrderId.current) pendingOrderId.current = crypto.randomUUID();

    try {
      await api.submitOrder({
        items: orderedItems.map(i => ({ name: i.name, price: i.price, qty: i.qty, note: i.note, img: i.img, description: i.description })),
        table_number: tableId,
        totals,
        clientOrderId: pendingOrderId.current,
        sessionId: getSessionId(),
      });
      trackOrdered(orderedItems.map(i => i.name));
      setHistory([...currentOrder, ...orderedItems]);
      setLastOrder(orderedItems);
      clear();
      setTab('current');
      setSubmitted(true);
      pendingOrderId.current = null;
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  function closeSheet() {
    onClose();
    setSubmitted(false);
  }

  if (!open) return null;

  const currentRec = recs[recIndex];

  return (
    <>
      <div className={styles.backdrop} onClick={closeSheet} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Your order">
        <div className={styles.head}>
          <div className={styles.headTitle}>{submitted ? 'Your Order' : tab === 'favorites' ? 'Favorites' : tab === 'current' ? 'Current Order' : 'Your Order'}</div>
          <div className={styles.headSub}>{tableLabel}{!submitted && items.length > 0 ? ` · ${count} ${count === 1 ? 'item' : 'items'}` : ''}</div>
          {!submitted && (
            <div className={styles.tabs}>
              <button type="button" className={`${styles.tab} ${tab === 'cart' ? styles.tabActive : ''}`} onClick={() => setTab('cart')}>Cart</button>
              <button type="button" className={`${styles.tab} ${tab === 'current' ? styles.tabActive : ''}`} onClick={() => setTab('current')}>Current Order</button>
              <button type="button" className={`${styles.tab} ${tab === 'favorites' ? styles.tabActive : ''}`} onClick={() => setTab('favorites')} aria-label="Favorites"><Heart size={13} /></button>
            </div>
          )}
          <button type="button" className={styles.closeBtn} onClick={closeSheet}>Close</button>
        </div>

        <div className={styles.scroll}>
          {submitted ? (
            <div className={styles.confirm}>
              <div className={styles.confirmMark} aria-hidden>№</div>
              <div className={styles.confirmTitle}>Sent to the kitchen</div>
              <div className={styles.confirmLine}>{tableLabel}'s order is on its way — thank you for dining with us.</div>
              {lastOrder.length > 0 && (
                <div className={styles.successSummary}>
                  {lastOrder.map((item, i) => (
                    <div key={`${item.name}-${i}`} className={styles.successRow}>
                      <span>{item.qty}× {item.name}</span>
                      <span>{formatPrice(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className={styles.browseBtn} onClick={closeSheet}>Continue Browsing</button>
            </div>
          ) : tab === 'cart' ? (
            items.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyLine}>Your table awaits its first course.</div>
                <button type="button" className={styles.browseBtn} onClick={onClose}>Browse the Menu</button>
              </div>
            ) : (
              <>
                <div className={styles.lines}>
                  {items.map((item, i) => (
                    <PremiumCartItem
                      key={`${item.name}-${item.price}`}
                      item={item}
                      index={i}
                      onUpdateQty={updateQty}
                      onRemove={removeAt}
                      onNoteChange={setNote}
                      guestLabel={guestLabelFor(item.addedByDevice)}
                    />
                  ))}
                </div>

                {(currentRec || recommendationsLoading) && (
                  <div className={styles.recBlock}>
                    <div className={styles.recEyebrow}>You May Also Enjoy</div>
                    {currentRec ? (
                      <div className={styles.recRow}>
                        {currentRec.img && <img src={resolveThumbnail({ name: currentRec.name, img: currentRec.img, price: currentRec.price || 0 } as MenuItem)} alt={currentRec.name} className={styles.recImg} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.recName}>{currentRec.name}</div>
                          {currentRec.reason && <div className={styles.recSub}>{currentRec.reason}</div>}
                        </div>
                        <button type="button" className={styles.recAdd} onClick={() => addItem({ name: currentRec.name, price: currentRec.price, img: currentRec.img, description: currentRec.description || '', categoryType: currentRec.categoryType, beverageKind: currentRec.beverageKind })}>Add</button>
                      </div>
                    ) : (
                      <div className={styles.recSub}>Finding a pairing…</div>
                    )}
                  </div>
                )}

                <div style={{ padding: '0 20px' }}>
                  <PremiumTipSelector />
                </div>

                <div className={styles.footer} style={{ borderTop: 'none' }}>
                  <div className={styles.totalRow}><span className={styles.totalLabel}>Subtotal</span><span>{formatPrice(totals.subtotal)}</span></div>
                  <div className={styles.totalRow}><span className={styles.totalLabel}>VAT</span><span>{formatPrice(totals.vat)}</span></div>
                  <div className={styles.totalRow}><span className={styles.totalLabel}>Service</span><span>{formatPrice(totals.service)}</span></div>
                  {totals.tip > 0 && <div className={styles.totalRow}><span className={styles.totalLabel}>Tip</span><span>{formatPrice(totals.tip)}</span></div>}
                  <div className={styles.totalRow} style={{ marginTop: 8 }}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalValue}>{formatPrice(totals.total)}</span>
                  </div>
                </div>
              </>
            )
          ) : tab === 'current' ? (
            <div className={styles.lines}>
              {currentOrder.length === 0 ? (
                <div className={styles.empty}><div className={styles.emptyLine}>No order placed for this table yet.</div></div>
              ) : currentOrder.map((item, i) => {
                const imgSrc = resolveThumbnail({ name: item.name, price: item.price, description: item.description, img: item.img } as MenuItem);
                return (
                  <div key={`${item.name}-${i}`} className={styles.historyRow}>
                    {imgSrc ? <img src={imgSrc} alt={item.name} className={styles.lineImg} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }} /> : <div className={styles.lineImgPh} />}
                    <div className={styles.historyMeta}>
                      <span className={styles.lineName}>{item.name}</span>
                      {item.note && <span className={styles.historyNote}>{item.note}</span>}
                    </div>
                    <span className={styles.historyQty}>×{item.qty}</span>
                    <span className={styles.historyPrice}>{formatPrice(item.price * item.qty)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.lines}>
              {favoriteRows.length === 0 ? (
                <div className={styles.empty}><div className={styles.emptyLine}>Your favourite dishes will appear here.</div></div>
              ) : favoriteRows.map(({ name, item }) => (
                <div key={name} className={styles.favoriteRow}>
                  {item ? <img src={resolveThumbnail(item)} alt={item.name} className={styles.lineImg} loading="lazy" /> : <div className={styles.lineImgPh} />}
                  <button type="button" className={styles.favoriteMain} onClick={() => openMenuItem(name)}>
                    <span className={styles.lineName}>{item?.name || name}</span>
                    {item?.price ? <span className={styles.favoritePrice}>{formatPrice(item.price)}</span> : null}
                  </button>
                  {item && (
                    <button type="button" className={styles.favoriteAdd} onClick={() => addFavoriteToCart(item)} aria-label={`Add ${item.name}`}>
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === 'cart' && items.length > 0 && !submitted && (
          <div className={styles.footer}>
            {submitError && <p className={styles.errorMsg} role="alert">Couldn't send your order — please try again.</p>}
            <button type="button" className={styles.submitBtn} disabled={submitting} onClick={handleSubmit}>
              {submitting ? <Spinner size={16} /> : 'Add to Table'}
            </button>
          </div>
        )}
        {currentOrder.length > 0 && !submitted && !(tab === 'cart' && items.length === 0) && (
          <div className={styles.billFooter}>
            <button type="button" className={styles.billLink} onClick={() => setReceiptOpen(true)}>View Bill</button>
          </div>
        )}
      </div>

      {receiptOpen && (
        <PremiumReceiptView tableId={tableId || 'table1'} items={currentOrder} onClose={() => setReceiptOpen(false)} />
      )}
    </>
  );
}
