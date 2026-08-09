import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { api } from '../../services/api';
import { track } from '../../lib/engagement';
import { useT } from '../../i18n';
import styles from './ItemGallery.module.css';

/**
 * The extra photographs and videos an owner has attached to a dish.
 *
 * The dish's primary image and video are already shown by the modal's own media
 * block; this is the gallery *on top of* them, which is what "significantly
 * more photos and videos" needed. Nothing renders at all until there is more
 * than the primary asset, so a dish with one photo looks exactly as it did.
 */

interface Asset {
  id: number;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  posterUrl: string;
  alt: string;
  caption: string;
  featured: boolean;
}

export function ItemGallery({ menuItemId, itemName }: { menuItemId: number; itemName: string }) {
  const t = useT();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [active, setActive] = useState<Asset | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAssets([]);
    setActive(null);
    api.getItemGallery(menuItemId)
      .then(res => {
        if (cancelled) return;
        const list = (res as { media: Asset[] }).media ?? [];
        // The featured asset is the one the modal already shows above.
        setAssets(list.filter(a => !a.featured));
      })
      .catch(() => { /* a dish simply has no gallery */ });
    return () => { cancelled = true; };
  }, [menuItemId]);

  if (assets.length === 0) return null;

  const hasVideo = assets.some(a => a.kind === 'VIDEO');

  return (
    <div className={styles.wrap}>
      <h4 className={styles.title}>{hasVideo ? `${t('dish.photos')} · ${t('dish.videos')}` : t('dish.photos')}</h4>

      <ul className={styles.strip}>
        {assets.map(a => (
          <li key={a.id}>
            <button
              type="button"
              className={`${styles.thumb} ${active?.id === a.id ? styles.thumbOn : ''}`}
              onClick={() => {
                const next = active?.id === a.id ? null : a;
                setActive(next);
                if (next) {
                  track({
                    eventType: 'PHOTO_VIEW',
                    menuItemId,
                    label: itemName,
                    meta: { assetId: a.id, kind: a.kind },
                  });
                }
              }}
              aria-label={a.caption || a.alt || `${itemName} ${a.kind === 'VIDEO' ? 'video' : 'photo'}`}
              aria-pressed={active?.id === a.id}
            >
              <img
                src={a.kind === 'VIDEO' ? (a.posterUrl || a.url) : a.url}
                alt=""
                loading="lazy"
                decoding="async"
              />
              {a.kind === 'VIDEO' && <span className={styles.play} aria-hidden><Film size={13} /></span>}
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <figure className={styles.viewer}>
          {active.kind === 'VIDEO' ? (
            <video
              src={active.url}
              poster={active.posterUrl || undefined}
              controls
              playsInline
              autoPlay
              muted
              onPlaying={() => track({ eventType: 'VIDEO_PLAY', menuItemId, label: itemName })}
              onEnded={() => track({ eventType: 'VIDEO_COMPLETE', menuItemId, label: itemName })}
            />
          ) : (
            <img src={active.url} alt={active.alt || itemName} decoding="async" />
          )}
          {active.caption && <figcaption dir="auto">{active.caption}</figcaption>}
        </figure>
      )}
    </div>
  );
}
