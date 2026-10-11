import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@kstackz/web-platform/components/dialog';
import { SHOTS } from './beats.js';
import { Frame } from './frame.js';
import { CHAPTERS } from './script.js';

/*
 * The storyboard for the Effect Oak Walkthrough: every beat in order, with
 * what is said and what happens. Play any beat to watch it in the frame,
 * then step on through the ones after it, the way the video runs.
 */

export function Showreel({ menu }: { menu?: ReactNode }) {
  const [playing, setPlaying] = useState<number>();

  return (
    <div className="h-dvh overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {menu}
        <header className="mt-6 mb-14">
          <h1 className="text-3xl font-semibold tracking-tight">
            Effect Oak, the Walkthrough
          </h1>
          <p className="mt-3 text-muted-foreground">
            The storyboard: {SHOTS.length} beats in {CHAPTERS.length - 1}{' '}
            chapters. Play any beat, then step through the rest with the arrow
            keys. The apps on the right are the real Rockets demo.
          </p>
          <button
            type="button"
            onClick={() => setPlaying(0)}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-foreground px-4 py-1.5 text-sm hover:bg-foreground/5"
          >
            <Play className="size-3.5" /> Play from the start
          </button>
        </header>

        {CHAPTERS.map((chapter) => (
          <section key={chapter.n} className="mb-14">
            <h2 className="flex items-baseline gap-3 border-b pb-2">
              <span className="font-mono text-sm text-muted-foreground">
                {chapter.n}
              </span>
              <span className="text-xl font-semibold">{chapter.title}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {chapter.idea}
              </span>
            </h2>
            <ol>
              {SHOTS.map((shot, i) =>
                shot.chapter !== chapter.n ? null : (
                  <li
                    key={shot.id}
                    className="grid grid-cols-[2rem_1fr] gap-x-3 border-b py-5"
                  >
                    <button
                      type="button"
                      aria-label={`Play beat ${i + 1}`}
                      onClick={() => setPlaying(i)}
                      className="mt-0.5 flex size-7 items-center justify-center rounded-full border hover:border-foreground"
                    >
                      <Play className="size-3" />
                    </button>
                    <div>
                      <p className="font-medium">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        {shot.title}
                      </p>
                      {shot.say && (
                        <p className="mt-2 text-[15px] leading-relaxed">
                          “{shot.say}”
                        </p>
                      )}
                      <p className="mt-2 text-sm text-muted-foreground">
                        {shot.direction}
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </section>
        ))}

        <Dialog
          open={playing !== undefined}
          onOpenChange={(open) => !open && setPlaying(undefined)}
        >
          <DialogContent className="gap-4 p-4 sm:max-w-[min(92vw,1280px)]">
            {playing !== undefined && (
              <Player at={playing} onMove={setPlaying} />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Player({ at, onMove }: { at: number; onMove: (i: number) => void }) {
  const shot = SHOTS[at]!;
  const move = (by: number) =>
    onMove(Math.min(SHOTS.length - 1, Math.max(0, at + by)));

  return (
    <div
      className="grid gap-4 outline-none"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') move(1);
        if (event.key === 'ArrowLeft') move(-1);
      }}
    >
      <div className="overflow-hidden rounded-lg ring-1 ring-edge">
        <Frame shot={shot} />
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
        <button
          type="button"
          aria-label="Previous beat"
          onClick={() => move(-1)}
          disabled={at === 0}
          className="rounded-full border p-1.5 disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div>
          <DialogTitle className="text-sm">
            <span className="mr-2 font-mono text-xs text-muted-foreground">
              {at + 1} / {SHOTS.length}
            </span>
            {CHAPTERS[shot.chapter]!.title} · {shot.title}
          </DialogTitle>
          {shot.say && <p className="mt-1.5 text-[15px]">“{shot.say}”</p>}
          <p className="mt-1.5 text-muted-foreground">{shot.direction}</p>
        </div>
        <button
          type="button"
          aria-label="Next beat"
          onClick={() => move(1)}
          disabled={at === SHOTS.length - 1}
          className="rounded-full border p-1.5 disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    /** How the recorder drives the frame: which beat it shows. */
    showreel?: {
      readonly ids: ReadonlyArray<string>;
      go: (id: string) => void;
    };
  }
}

/**
 * The frame alone, filling the window, for the recorder: it starts on the
 * first beat and moves on when `window.showreel.go(id)` says.
 */
export function Recording() {
  const [at, setAt] = useState(0);
  const [hook] = useState(() => (element: HTMLDivElement | null) => {
    if (!element) return;
    window.showreel = {
      ids: SHOTS.map((shot) => shot.id),
      go: (id) => setAt(SHOTS.findIndex((shot) => shot.id === id)),
    };
    return () => {
      delete window.showreel;
    };
  });
  return (
    <div ref={hook} className="h-dvh w-dvw overflow-hidden bg-background">
      <Frame shot={SHOTS[at]!} />
    </div>
  );
}
