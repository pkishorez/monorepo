import { useEffect, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { clock } from '../../../format/index.ts';
import {
  ENDING,
  Keep,
  resumeAt,
  speedOf,
  STARTING,
  throttled,
} from '../../../keep/index.ts';
import type { Player } from './player.ts';

/*
 * The short video picks up where it was left. Where it is gets kept every
 * 2 s while it plays, and at once on a pause, a seek, and as the tab is
 * hidden or the page goes, which is when iPhone Safari tends to drop a
 * tab. Drawn again, it goes back there without playing, at the speed and
 * volume last set, and says so for a few seconds, with a way to start
 * over. Near either end it starts at the top.
 */

/** How long "Resumed at" shows, in ms. */
const SHOWN_MS = 6000;

/** Keeps where `player` is for Video `id`; the time it resumed at, while that shows. */
export function useResume(player: Player, id: string) {
  const [resumed, setResumed] = useState<number | null>(null);

  useEffect(() => {
    const video = player.video();
    if (video === null) return;
    const settings = Keep.settings.read();
    let ready = false;
    const saved = throttled(
      (time: number) => Keep.watched.change(id, { time }),
      2000,
    );

    const restore = () => {
      if (ready) return;
      ready = true;
      const speed = speedOf(settings.speed);
      if (speed !== null) {
        video.defaultPlaybackRate = speed;
        video.playbackRate = speed;
      }
      if (settings.volume !== undefined)
        video.volume = Math.min(1, Math.max(0, settings.volume));
      if (settings.muted !== undefined) video.muted = settings.muted;
      // The video's URL starts it where it was left; this only corrects it.
      const at = resumeAt(Keep.watched.read(id).time, video.duration);
      if (at === null) {
        if (video.currentTime > 1) video.currentTime = 0;
        return;
      }
      if (Math.abs(video.currentTime - at) > 0.5) video.currentTime = at;
      setResumed(at);
    };

    const save = () => {
      if (!ready) return;
      const time = video.currentTime;
      const near =
        time < STARTING ||
        (Number.isFinite(video.duration) && time >= video.duration - ENDING);
      if (!near) return saved.call(time);
      saved.cancel();
      Keep.watched.finish(id);
    };
    const now = () => {
      save();
      saved.flush();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') now();
    };
    const rate = () => {
      if (ready) Keep.settings.change({ speed: video.playbackRate });
    };
    const volume = () => {
      if (ready)
        Keep.settings.change({ volume: video.volume, muted: video.muted });
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) restore();
    else video.addEventListener('loadedmetadata', restore, { once: true });
    video.addEventListener('timeupdate', save);
    video.addEventListener('pause', now);
    // Where a seek goes is known as it starts, before its frames arrive.
    video.addEventListener('seeking', now);
    video.addEventListener('seeked', now);
    video.addEventListener('ended', now);
    video.addEventListener('ratechange', rate);
    video.addEventListener('volumechange', volume);
    addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      now();
      video.removeEventListener('loadedmetadata', restore);
      video.removeEventListener('timeupdate', save);
      video.removeEventListener('pause', now);
      video.removeEventListener('seeking', now);
      video.removeEventListener('seeked', now);
      video.removeEventListener('ended', now);
      video.removeEventListener('ratechange', rate);
      video.removeEventListener('volumechange', volume);
      removeEventListener('pagehide', now);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [player, id]);

  useEffect(() => {
    if (resumed === null) return;
    const timer = setTimeout(() => setResumed(null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [resumed]);

  return {
    resumed,
    /** Back to the start, paused or playing as it was. */
    startOver: () => {
      const video = player.video();
      if (video !== null) video.currentTime = 0;
      setResumed(null);
    },
  };
}

/** "Resumed at 12:34", over the video's top corner, with a way back to the start. */
export function Resumed({
  at,
  onStartOver,
}: {
  readonly at: number | null;
  readonly onStartOver: () => void;
}) {
  // Kept while it fades, so its words do not blank out.
  const [shown, setShown] = useState(at);
  useEffect(() => {
    if (at !== null) setShown(at);
  }, [at]);
  return (
    <div
      role="status"
      aria-hidden={at === null}
      inert={at === null}
      className={`absolute top-2 left-2 z-20 flex items-center gap-1 rounded-full bg-black/75 py-0.5 pr-0.5 pl-3 text-sm text-white tabular-nums shadow-md backdrop-blur-sm transition-opacity duration-150 ease-out motion-reduce:transition-none sm:top-3 sm:left-3 ${at === null ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      {shown !== null && <>Resumed at {clock(shown)}</>}
      <button
        type="button"
        onClick={onStartOver}
        className="flex h-10 items-center gap-1.5 rounded-full px-3 font-medium text-white/90 outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/50 active:scale-[0.97] pointer-fine:h-8"
      >
        <RotateCcwIcon className="size-3.5" aria-hidden /> Start over
      </button>
    </div>
  );
}
