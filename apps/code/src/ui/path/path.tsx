/** A path under a home folder as `~/…`. */
export const tilde = (path: string) =>
  path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');

/** A path cut in its middle, so its last part always shows. */
export function Path({ value }: { readonly value: string }) {
  const at = value.lastIndexOf('/', value.length - 2) + 1;
  return (
    <span className="flex min-w-0 font-mono" title={value}>
      <span className="truncate">{value.slice(0, at)}</span>
      <span className="shrink-0">{value.slice(at)}</span>
    </span>
  );
}
