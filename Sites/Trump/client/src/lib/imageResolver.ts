import { BASE_PATH } from '../constants/api';
import type { MenuItem } from '../types/menu';

const KEYWORD_MAP: Record<string, string> = {
  tomahawk: 'Tomahawk.jpg',
  ribeye: 'Ribeye.jpg',
  'beef fillet': 'Beef fillet.jpg',
  fillet: 'Beef fillet.jpg',
  rump: 'Rump Steak.jpg',
  sirloin: 'Sirloin.jpg',
  't-bone': 'T-bone.jpg',
  calamari: 'Calamari.jpeg',
  prawn: 'Butter-garlic-prawns.jpg',
  oyster: 'Oyster.jpg',
  salmon: 'Salmon.jpg',
  'pork chop': 'Crispy Pork Chops.jpg',
  'lamb chop': 'Crispy Lamb Chops.jpg',
  'lamb rack': 'Lamb Rack.jpg',
  cheesecake: 'Cheese Cake.jpg',
  baklava: 'Baklava Cheese Cake.jpg',
  chocolate: 'Chocolate Fondant.jpg',
  margarita: 'Margarita.jpg',
  mojito: 'Mojito.jpg',
  'old fashioned': 'Old Fashioned.jpg',
  espresso: 'Espresso Martini.jpg',
  heineken: 'Heineken (330ml).jpg',
  burger: 'Smash Burger.jpg',
  sushi: 'Sushi Platter.jpg',
  tempura: 'Tempura.jpg',
  salad: 'Salad.jpg',
  pasta: 'Pasta.jpg',
  chicken: 'Chicken.jpg',
  oxtail: 'Oxtail.jpg',
  ribs: 'Beef Ribs.jpg',
};

export function resolveImage(item: MenuItem): string {
  if (item.imageVisible === false) return '';

  const raw = item.img;
  if (raw && raw.trim()) {
    if (/^https?:\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }
    if (raw.startsWith(`${BASE_PATH}/`)) return raw;
    if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
    return `${BASE_PATH}/${raw}`;
  }

  // Infer from name/description
  const haystack = `${item.name} ${item.description || ''}`.toLowerCase();
  for (const [kw, file] of Object.entries(KEYWORD_MAP)) {
    if (haystack.includes(kw)) return `${BASE_PATH}/Images/${file}`;
  }

  return `${BASE_PATH}/Images/Tomahawk.jpg`;
}

export function resolveVideo(item: MenuItem): string | null {
  if (item.videoVisible === false || !item.video?.trim()) return null;
  const raw = item.video.trim();
  if (/^https?:\/\//.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }
  if (raw.startsWith(`${BASE_PATH}/`)) return raw;
  if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
  return `${BASE_PATH}/${raw}`;
}

export function normalizeYouTubeId(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const direct = raw.match(/^[a-zA-Z0-9_-]{11}$/);
  if (direct) return raw;

  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

export function resolveYouTubeEmbed(item: MenuItem, autoplay = false): string | null {
  if (item.videoVisible === false) return null;
  const id = normalizeYouTubeId(item.youtubeId);
  if (!id) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1'
  });
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('mute', '1');
  }
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function resolveAssetPath(path: string): string {
  const raw = String(path || '').trim();
  if (!raw) return raw;
  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith(`${BASE_PATH}/`)) return raw;
  if (raw.startsWith('/')) return `${BASE_PATH}${raw}`;
  return `${BASE_PATH}/${raw}`;
}
