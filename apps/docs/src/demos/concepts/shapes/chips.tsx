import type { ReactNode } from 'react';

/** The row of Chips under an Instance's shapes. */
export const Chips = ({ children }: { readonly children: ReactNode }) => (
  <div className="flex flex-wrap justify-center gap-2">{children}</div>
);

/** A small labelled button for a Message that is not the Circle's main one. */
export const Chip = ({
  onClick,
  disabled,
  children,
}: {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="rounded-full border px-3 py-1 font-mono text-xs text-foreground transition-colors duration-150 hover:bg-foreground/5 disabled:opacity-40 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);
