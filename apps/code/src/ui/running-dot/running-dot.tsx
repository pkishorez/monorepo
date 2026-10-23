/** A session at work: a small green dot, breathing unless motion is reduced. */
export function RunningDot({ label = 'Running' }: { readonly label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="relative inline-flex size-2 shrink-0"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-positive opacity-40 motion-reduce:hidden" />
      <span className="relative size-2 rounded-full bg-positive" />
    </span>
  );
}
