import { X, ShoppingCart } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { formatPrice } from '../../lib/menuUtils';
import { resolveThumbnail } from '../../lib/imageResolver';
import type { Promotion } from '../../services/api';
import styles from './DealOfDayModal.module.css';

interface DealOfDayModalProps {
  deal: Promotion | null;
  open: boolean;
  onClose: () => void;
  onAddDeal: (deal: Promotion) => void;
}

// The Deal of the Day popup -- full description, every included dish (with
// its own image), and, when the admin has set a bundle price, the
// original-combined-price/savings pair. "Add complete deal" always adds ONE
// line to the cart (the deal itself), never the individual dishes
// separately -- see resolveCartPrice's handleAddDeal in MenuPage.tsx.
export function DealOfDayModal({ deal, open, onClose, onAddDeal }: DealOfDayModalProps) {
  if (!deal) return null;
  const hasBundlePrice = deal.dealPrice != null;
  // Same fallback MenuPage's own handleAddDeal already uses when adding this
  // deal to the cart -- a real dish photo beats an empty placeholder panel
  // whenever the admin hasn't set a dedicated banner image.
  const heroImg = deal.bannerImage || deal.items[0]?.img || '';

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className={styles.modal}>
        <div className={styles.media}>
          {heroImg && (
            <img src={resolveThumbnail({ name: deal.title, price: 0, img: heroImg })} alt="" className={styles.image} />
          )}
          <div className={styles.mediaTint} />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className={styles.content}>
          <div className={styles.body}>
            <div className={styles.chips}>
              {deal.badge && <Badge variant="gold">{deal.badge}</Badge>}
            </div>
            <span className={styles.eyebrow}>Deal of the Day</span>
            <h2 className={styles.title}>{deal.title}</h2>
            {deal.description && <p className={styles.description}>{deal.description}</p>}

            {hasBundlePrice && (
              <p className={styles.priceRow}>
                <span className={styles.priceStrike}>{formatPrice(deal.originalPrice)}</span>
                <span className={styles.price}>{formatPrice(deal.dealPrice!)}</span>
                {deal.savings != null && deal.savings > 0 && <span className={styles.savingsBadge}>Save {formatPrice(deal.savings)}</span>}
              </p>
            )}

            {deal.items.length > 0 && (
              <div className={styles.items}>
                <h3 className={styles.itemsTitle}>Included</h3>
                <div className={styles.itemGrid}>
                  {deal.items.map(item => (
                    <div key={item.id} className={styles.itemCard}>
                      {item.img && <img src={resolveThumbnail({ name: item.name, price: item.price, img: item.img })} alt={item.name} className={styles.itemThumb} />}
                      <div className={styles.itemInfo}>
                        <span className={styles.itemName}>{item.name}</span>
                        {!hasBundlePrice && <span className={styles.itemPrice}>{formatPrice(item.price)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.addBtn} onClick={() => onAddDeal(deal)}>
              <ShoppingCart size={18} />
              Add Complete Deal{hasBundlePrice ? ` · ${formatPrice(deal.dealPrice!)}` : ''}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
