/** code's mark: a prompt in a tile the opposite of the page: light in the dark theme, as the iOS Splash draws it, and dark in the light. */
export function Mark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={`shrink-0 rounded-[25%] bg-foreground text-background ${className ?? ''}`}
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
