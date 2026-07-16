import { useEffect, useRef, useState } from 'react';

// Adds a "revealed" flag the first time the element scrolls into view, then
// disconnects -- a one-shot fade/rise-in, not a repeating scroll-jank effect.
// Falls back to already-revealed if IntersectionObserver isn't available
// (never blocks content behind JS support).
export function useScrollReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, revealed };
}
