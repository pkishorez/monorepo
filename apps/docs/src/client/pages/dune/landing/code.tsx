import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
} from 'react';
import type { MDXComponents } from 'mdx/types';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { FOCUS } from './styles.ts';

/*
 * Code, as the page shows it: a block Shiki coloured at build time, in a
 * frame with its file's name and a button that copies it.
 */

type Snippet = ComponentType<{ readonly components?: MDXComponents }>;

export function Code({
  name,
  code: Snippet,
}: {
  readonly name: string;
  readonly code: Snippet;
}) {
  const components = useMemo<MDXComponents>(
    () => ({ pre: (props) => <Pre name={name} {...props} /> }),
    [name],
  );
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-(--dn-line) bg-(--dn-sunken)">
      <Snippet components={components} />
    </div>
  );
}

function Pre({
  name,
  className,
  style,
  ...props
}: ComponentProps<'pre'> & { readonly name: string }) {
  const pre = useRef<HTMLPreElement>(null);
  return (
    <>
      <div className="flex h-11 items-center justify-between border-b border-(--dn-line) pr-2 pl-4">
        <span className="font-mono text-xs text-(--dn-text-3)">{name}</span>
        <CopyButton
          text={() => pre.current?.textContent ?? ''}
          label={`Copy ${name}`}
        />
      </div>
      <pre
        ref={pre}
        {...props}
        // The page's own surface shows through Shiki's.
        style={{ ...style, ['--color-muted' as string]: 'transparent' }}
        className={`${className ?? ''} overflow-x-auto p-4 font-mono text-[12.5px] leading-6 [scrollbar-color:var(--dn-control)_transparent] [scrollbar-width:thin]`}
      />
    </>
  );
}

/** Copies, then says so with a tick for a moment. */
export function CopyButton({
  text,
  label,
}: {
  /** What to copy, or how to read it when clicked. */
  readonly text: string | (() => string);
  readonly label: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={label}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(typeof text === 'string' ? text : text())
          .then(() => setCopied(true));
      }}
      className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-(--dn-text-3) transition-[color,background-color,transform] duration-150 hover:bg-(--dn-raised) hover:text-(--dn-text) active:scale-90 ${FOCUS}`}
    >
      {copied ? (
        <CheckIcon className="size-4 text-(--dn-live)" strokeWidth={2} />
      ) : (
        <CopyIcon className="size-4" strokeWidth={2} />
      )}
    </button>
  );
}
