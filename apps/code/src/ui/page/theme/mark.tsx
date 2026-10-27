/** code's mark: a prompt in a tile, black on white or white on black, as the theme is. */
export function Mark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={`shrink-0 rounded-[5px] bg-foreground text-background ${className ?? ''}`}
    >
      <path
        d="M6 7l3 3-3 3M10.5 13.5H14"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
