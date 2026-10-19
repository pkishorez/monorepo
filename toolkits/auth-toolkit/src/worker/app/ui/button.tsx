import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { Spinner } from './spinner.tsx';

/*
 * One look for every action: `primary` is the page's one next step, in the
 * brand's accent; `secondary` sits beside it; `ghost` is a row's quiet
 * action. A busy button keeps its width and says what it is doing.
 */

export type Tone = 'primary' | 'secondary' | 'ghost';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none touch-manipulation';

const tones: Record<Tone, string> = {
  primary:
    'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-accent-hover disabled:not-aria-busy:bg-muted disabled:not-aria-busy:text-faint disabled:not-aria-busy:shadow-none',
  secondary:
    'bg-surface text-fg shadow-(--shadow-control) hover:bg-hover disabled:text-faint',
  ghost: 'text-fg hover:bg-hover disabled:text-faint',
};

// Every size is at least 44px to a thumb: `md` is 44px on a phone, 40px
// with a pointer; `sm` keeps its 32px look and reaches 44px past its edges.
const sizes = {
  md: 'h-11 px-4 text-[15px] sm:h-10',
  lg: 'h-11 px-5 text-[15px] w-full',
  sm: 'h-8 px-3 text-sm before:absolute before:inset-x-0 before:-inset-y-1.5',
};

export const buttonClass = (
  tone: Tone = 'secondary',
  size: keyof typeof sizes = 'md',
  className?: string,
) => cx(base, tones[tone], sizes[size], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: keyof typeof sizes;
  /** Shown with a spinner in place of the label while true. */
  busy?: string | false | undefined;
}

export function Button({
  tone,
  size,
  busy,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || Boolean(busy)}
      aria-busy={busy ? true : undefined}
      className={buttonClass(tone, size, className)}
      {...props}
    >
      {busy ? (
        <>
          <Spinner />
          {busy}
        </>
      ) : (
        children
      )}
    </button>
  );
}

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  tone?: Tone;
  size?: keyof typeof sizes;
}

export function LinkButton({
  tone,
  size,
  className,
  ...props
}: LinkButtonProps) {
  return <a className={buttonClass(tone, size, className)} {...props} />;
}
