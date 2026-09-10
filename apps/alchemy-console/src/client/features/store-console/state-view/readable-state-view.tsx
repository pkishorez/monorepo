import { JsonViewer } from 'kui-toolkit/components/blocks/json';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { Button } from 'kui-toolkit/components/ui/button';
import type { ReadableNode } from './readable-state.ts';

const Scalar = ({
  node,
}: {
  node: Extract<ReadableNode, { kind: 'scalar' }>;
}) => {
  const text =
    node.value === null
      ? 'None'
      : typeof node.value === 'boolean'
        ? node.value
          ? 'Yes'
          : 'No'
        : String(node.value);
  return node.url ? (
    <a href={String(node.value)} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span className="font-mono text-xs tabular-nums [overflow-wrap:anywhere]">
      {text}
    </span>
  );
};

export function ReadableValue({
  node,
  depth = 0,
}: {
  node: ReadableNode;
  depth?: number;
}) {
  if (node.kind === 'empty')
    return <p className="text-sm text-muted-foreground">No values</p>;
  if (node.kind === 'scalar') return <Scalar node={node} />;
  if (node.kind === 'table')
    return (
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {node.columns.map((column) => (
                <th key={column.key} className="px-3 py-2 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {node.rows.map((row, index) => (
              <tr key={index}>
                {node.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 align-top">
                    <Scalar
                      node={{
                        kind: 'scalar',
                        value: row[column.key] ?? null,
                        url: false,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (node.kind === 'list')
    return (
      <ol className="grid gap-3">
        {node.items.map((item, index) => (
          <li
            key={index}
            className="flex min-w-0 items-start gap-3 rounded-md border bg-muted/10 p-3"
          >
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] tabular-nums text-muted-foreground"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <ReadableValue node={item} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ol>
    );
  return (
    <dl
      className={
        depth === 0
          ? 'divide-y rounded-md border'
          : 'grid gap-3 border-l border-border/70 pl-4'
      }
    >
      {node.fields.map((field) => {
        const structured =
          field.value.kind === 'fields' ||
          field.value.kind === 'list' ||
          field.value.kind === 'table';
        return (
          <div
            key={field.key}
            className={`grid min-w-0 gap-1.5 ${depth === 0 ? 'px-3 py-3' : ''} ${structured ? '' : 'sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)] sm:gap-4'}`}
          >
            <dt className="text-xs font-medium text-muted-foreground">
              {field.label}
            </dt>
            <dd className="min-w-0">
              <ReadableValue node={field.value} depth={depth + 1} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function RawDataDialog({
  open,
  onOpenChange,
  title,
  description,
  value,
  pending = false,
  error,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  value: unknown;
  pending?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && value === undefined ? (
          <div className="grid gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            {onRetry && (
              <Button variant="outline" className="w-fit" onClick={onRetry}>
                Retry loading raw data
              </Button>
            )}
          </div>
        ) : pending && value === undefined ? (
          <p
            role="status"
            className="py-8 text-center text-sm text-muted-foreground"
          >
            Loading masked JSON…
          </p>
        ) : (
          <JsonViewer value={value} label="Masked JSON" maxHeight="65dvh" />
        )}
      </DialogContent>
    </Dialog>
  );
}
