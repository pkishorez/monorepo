import type { ReactNode } from 'react';

/** Over the canvas, at its foot: what the Step or Scene says. */
export function Caption({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center md:justify-start">
      <div
        aria-live="polite"
        className="pointer-events-auto max-h-[40%] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
      >
        {children}
      </div>
    </div>
  );
}
