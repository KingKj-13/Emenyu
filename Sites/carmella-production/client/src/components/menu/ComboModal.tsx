import { X, ShoppingCart } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { formatPrice } from '../../lib/menuUtils';
import { resolveThumbnail } from '../../lib/imageResolver';
import type { ComboSpecial } from '../../services/api';
import styles from './DealOfDayModal.module.css';

interface ComboModalProps {
  combo: ComboSpecial | null;
  open: boolean;
  onClose: () => void;
  onAddCombo: (combo: ComboSpecial) => void;
}

// Same shell/visual language as DealOfDayModal, split into a Dishes group and
// an optional Drinks group. "Add complete combo" always adds ONE line to the
// cart at the combo price, never the individual items separately.
export function ComboModal({ combo, open, onClose, onAddCombo }: ComboModalProps) {
  if (!combo) return null;
  // Same fallback MenuPage's own handleAddCombo already uses when adding this
  // combo to the cart -- a real dish photo beats an empty placeholder panel
  // whenever the admin hasn't set a dedicated banner image.
  const heroImg = combo.bannerImage || combo.items[0]?.img || '';

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className={styles.modal}>
        <div className={styles.media}>
          {heroImg && (
            <img src={resolveThumbnail({ name: combo.title, price: 0, img: heroImg })} alt="" className={styles.image} />
          )}
          <div className={styles.mediaTint} />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className={styles.content}>
          <div className={styles.body}>
            <span className={styles.eyebrow}>Combo Special</span>
            <h2 className={styles.title}>{combo.title}</h2>
            {combo.description && <p className={styles.description}>{combo.description}</p>}

            <p className={styles.priceRow}>
              <span className={styles.priceStrike}>{formatPrice(combo.originalPrice)}</span>
              <span className={styles.price}>{formatPrice(combo.comboPrice)}</span>
              {combo.savings > 0 && <span className={styles.savingsBadge}>Save {formatPrice(combo.savings)}</span>}
            </p>

            {combo.items.length > 0 && (
              <div className={styles.items}>
                <h3 className={styles.itemsTitle}>Dishes</h3>
                <div className={styles.itemGrid}>
                  {combo.items.map(item => (
                    <div key={item.id} className={styles.itemCard}>
                      {item.img && <img src={resolveThumbnail({ name: item.name, price: item.price, img: item.img })} alt={item.name} className={styles.itemThumb} />}
                      <div className={styles.itemInfo}>
                        <span className={styles.itemName}>{item.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {combo.drinks.length > 0 && (
              <div className={styles.items} style={{ marginTop: 14 }}>
                <h3 className={styles.itemsTitle}>Drinks</h3>
                <div className={styles.itemGrid}>
                  {combo.drinks.map(item => (
                    <div key={item.id} className={styles.itemCard}>
                      {item.img && <img src={resolveThumbnail({ name: item.name, price: item.price, img: item.img })} alt={item.name} className={styles.itemThumb} />}
                      <div className={styles.itemInfo}>
                        <span className={styles.itemName}>{item.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.addBtn} onClick={() => onAddCombo(combo)}>
              <ShoppingCart size={18} />
              Add Complete Combo · {formatPrice(combo.comboPrice)}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
