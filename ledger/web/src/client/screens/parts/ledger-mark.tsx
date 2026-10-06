/** The app's mark: three bars, the last one rising. */
export function LedgerMark(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={props.className ?? 'size-12'}
    >
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <rect
        x="8"
        y="17"
        width="4"
        height="7"
        rx="2"
        className="fill-background"
      />
      <rect
        x="14"
        y="13"
        width="4"
        height="11"
        rx="2"
        className="fill-background"
      />
      <rect
        x="20"
        y="8"
        width="4"
        height="16"
        rx="2"
        className="fill-background"
      />
    </svg>
  );
}
