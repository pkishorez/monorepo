/** Laid over the road once you crash: when, and how to see why. */
export const CrashBanner = ({ time }: { readonly time: string }) => (
  <div className="absolute inset-x-3 top-3 flex flex-col items-center gap-0.5 rounded-lg bg-background/85 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
    <p className="text-sm font-medium">
      Crashed at <span className="font-mono tabular-nums">{time}</span>
    </p>
    <p className="text-xs text-pretty text-muted-foreground">
      Drag the timeline back to see it coming.
    </p>
  </div>
);
