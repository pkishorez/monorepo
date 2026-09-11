import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { JsonViewer } from 'kui-toolkit/components/blocks/json';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { ScrollArea } from 'kui-toolkit/components/ui/scroll-area';
import { Braces, Check, Copy, ExternalLink } from 'kui-toolkit/lucide';
import {
  clipboardText,
  isHttpUrl,
  type KeyValue,
  type Scalar,
} from './key-values.ts';

export type KeyValueGroup = { title?: string; rows: ReadonlyArray<KeyValue> };

function ScalarCell({ value }: { value: Scalar }) {
  if (isHttpUrl(value))
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-muted-foreground/50 underline-offset-2 transition-colors duration-150 hover:decoration-foreground"
      >
        {value}
        <ExternalLink
          className="ml-1 inline size-3 align-[-0.125em] text-muted-foreground"
          aria-hidden="true"
        />
      </a>
    );
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean')
    return <span className="text-muted-foreground">{String(value)}</span>;
  return <>{value}</>;
}

function ValueCell({ value }: { value: KeyValue['value'] }) {
  if (!Array.isArray(value)) return <ScalarCell value={value as Scalar} />;
  return (
    <ul className="space-y-0.5">
      {value.map((item, index) => (
        <li key={index}>
          <ScalarCell value={item} />
        </li>
      ))}
    </ul>
  );
}

/** Splits `hash.bundle` into a quieter path and the leaf that differs between rows. */
function KeyCell({ name }: { name: string }) {
  const index = name.lastIndexOf('.');
  const path = index === -1 ? '' : name.slice(0, index + 1);
  const leaf = index === -1 ? name : name.slice(index + 1);
  return (
    <span className="block max-w-[14rem] truncate" title={name}>
      {path && <span className="text-muted-foreground/60">{path}</span>}
      {leaf}
    </span>
  );
}

function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

function CopyButton({ name, text }: { name: string; text: string }) {
  const { copied, copy } = useCopied();
  const label = copied ? `Copied ${name}` : `Copy ${name}`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={() => copy(text)}
      aria-label={label}
      title={label}
      className="text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
    </Button>
  );
}

/**
 * Key column fits its longest key, values stay on one line and the table
 * scrolls sideways when they overflow with the key column pinned, and each
 * row copies on hover. The surface must be `bg-card` so the pinned column
 * covers what scrolls beneath it. Group titles render as muted rows inside the same table so the
 * columns line up across groups. Callers supply the surface via `className`.
 */
export function KeyValueTable({
  groups,
  empty,
  className = '',
}: {
  groups: ReadonlyArray<KeyValueGroup>;
  empty: string;
  className?: string;
}) {
  const filled = groups.filter((group) => group.rows.length > 0);
  if (filled.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ScrollArea orientation="horizontal" className={className}>
      <table className="w-full whitespace-nowrap text-left">
        <tbody>
          {filled.map((group, index) => (
            <Rows key={group.title ?? index} group={group} />
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function Rows({ group }: { group: KeyValueGroup }) {
  return (
    <>
      {group.title && (
        <tr className="bg-muted/40">
          <th
            colSpan={3}
            scope="colgroup"
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {group.title}
          </th>
        </tr>
      )}
      {group.rows.map((row) => {
        const text = clipboardText(row.value);
        return (
          <tr
            key={row.key}
            className="group/row border-t border-border/70 transition-colors duration-150 first:border-t-0 hover:bg-muted/30"
          >
            <th
              scope="row"
              className="sticky left-0 w-px bg-card py-2 pl-3 pr-6 align-baseline font-mono text-xs font-normal text-muted-foreground transition-colors duration-150 group-hover/row:bg-[color-mix(in_oklab,var(--muted)_30%,var(--card))]"
            >
              <KeyCell name={row.key} />
            </th>
            <td className="py-2 pr-2 align-baseline font-mono text-[13px] tabular-nums">
              <ValueCell value={row.value} />
            </td>
            <td className="w-px py-1 pr-2 align-top">
              {text !== null && <CopyButton name={row.key} text={text} />}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function JsonButton({
  title,
  value,
  label,
}: {
  title: string;
  value: unknown;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <Braces />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription>Masked JSON.</DialogDescription>
          </DialogHeader>
          <JsonViewer value={value} label="JSON" maxHeight="65dvh" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SectionHeading({
  id,
  title,
  count,
  action,
}: {
  id: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
