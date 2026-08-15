import { useCallback, useRef } from 'react';
import { track } from '../lib/engagement';

/**
 * Video engagement for the dish media.
 *
 * The dish video is muted, autoplaying and LOOPING, so `onEnded` never fires —
 * a naive completion listener would report zero for every dish forever. What
 * counts as "watched through" here is reaching the end of the FIRST pass, which
 * has to be detected from the time updates before the loop wraps.
 *
 * Each event fires at most once per open, so a guest who leaves a dish on
 * screen through five loops contributes one play and one completion, not five.
 */
export function useVideoEngagement(menuItemId: number | null | undefined, label: string) {
  const played = useRef(false);
  const halfway = useRef(false);
  const completed = useRef(false);

  /** Call when the modal opens/closes or the dish changes. */
  const reset = useCallback(() => {
    played.current = false;
    halfway.current = false;
    completed.current = false;
  }, []);

  const onPlaying = useCallback(() => {
    if (played.current) return;
    played.current = true;
    track({ eventType: 'VIDEO_PLAY', menuItemId: menuItemId ?? null, label });
  }, [menuItemId, label]);

  const onTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    const duration = el.duration;
    // duration is NaN until metadata lands, and Infinity for a live stream.
    if (!Number.isFinite(duration) || duration <= 0) return;
    const t = el.currentTime;

    if (!halfway.current && t >= duration / 2) {
      halfway.current = true;
      track({
        eventType: 'VIDEO_PROGRESS',
        menuItemId: menuItemId ?? null,
        label,
        positionSec: Math.round(t),
      });
    }
    // A 0.3s margin: the last timeupdate before a loop wrap rarely lands exactly
    // on `duration`, and browsers fire them roughly every 250ms.
    if (!completed.current && t >= duration - 0.3) {
      completed.current = true;
      track({
        eventType: 'VIDEO_COMPLETE',
        menuItemId: menuItemId ?? null,
        label,
        positionSec: Math.round(duration),
      });
    }
  }, [menuItemId, label]);

  return { onPlaying, onTimeUpdate, reset };
}
