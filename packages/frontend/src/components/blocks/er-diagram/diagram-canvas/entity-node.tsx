import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  ArrowUpRight,
  Box,
  Braces,
  Database,
  KeyRound,
  TriangleAlert,
} from 'lucide-react';

import { cn } from '#lib/utils';

import type { layoutGraph } from '../graph-layout';

type LayoutNode = Awaited<ReturnType<typeof layoutGraph>>['nodes'][number];
type DiagramNode = Node<
  LayoutNode['data'] & {
    readonly onEntitySelect?: (entityId: string) => void;
    readonly onFieldSelect?: (entityId: string, fieldName: string) => void;
    readonly onComplexFieldOpen?: (entityId: string, fieldName: string) => void;
    readonly onEntityHover?: (entityId: string, active: boolean) => void;
    readonly onFieldHover?: (
      entityId: string,
      fieldName: string,
      active: boolean,
    ) => void;
  },
  'entity'
>;

function TruncatedText({
  children,
  className,
}: {
  readonly children: string;
  readonly className?: string;
}) {
  return <span className={cn('min-w-0 truncate', className)}>{children}</span>;
}

function ExternalEntity({ data }: Pick<NodeProps<DiagramNode>, 'data'>) {
  const { entity } = data;
  return (
    <div
      role="group"
      aria-label={`${entity.label}, external entity`}
      onMouseEnter={() => data.onEntityHover?.(entity.id, true)}
      onMouseLeave={() => data.onEntityHover?.(entity.id, false)}
      className={cn(
        'relative h-full w-full rounded-xl border border-dashed border-amber-500/45 bg-amber-500/[0.055] text-card-foreground shadow-sm backdrop-blur-sm transition-[border-color,box-shadow,opacity] duration-200',
        data.related && 'border-amber-500/70 bg-amber-500/[0.08]',
        data.focused && 'border-amber-500/80 ring-2 ring-amber-500/20',
        data.dimmed && 'opacity-25 saturate-50',
      )}
    >
      <Handle
        id="external"
        type="target"
        position={Position.Left}
        className="!pointer-events-none !size-2.5 !-translate-x-px !border-2 !border-background !bg-amber-500"
      />
      <button
        type="button"
        aria-pressed={data.focused}
        className="flex h-full w-full cursor-pointer items-center gap-3 rounded-xl px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={(event) => {
          event.stopPropagation();
          data.onEntitySelect?.(entity.id);
        }}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <TriangleAlert className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {entity.label}
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700/80 dark:text-amber-400/80">
            External entity
          </span>
        </span>
      </button>
    </div>
  );
}

export function EntityNode({ data }: NodeProps<DiagramNode>) {
  const { entity } = data;
  if (entity.external) return <ExternalEntity data={data} />;
  const single = entity.kind === 'single';

  return (
    <div
      role="group"
      aria-label={`${entity.label} entity, ${entity.fields.length} fields`}
      onMouseEnter={() => data.onEntityHover?.(entity.id, true)}
      onMouseLeave={() => data.onEntityHover?.(entity.id, false)}
      className={cn(
        'h-full w-full overflow-hidden rounded-xl border border-border/90 bg-card text-card-foreground shadow-[0_10px_32px_-18px_color-mix(in_oklab,var(--foreground)_24%,transparent)] transition-[border-color,box-shadow,opacity,transform] duration-200',
        data.focused &&
          'border-primary/70 shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_48%,transparent)] ring-2 ring-primary/15',
        data.related && 'border-primary/45 bg-primary/[0.02]',
        data.dimmed && 'opacity-25 saturate-50',
      )}
    >
      <header
        className={cn(
          'h-[50px] border-b border-border/80 bg-muted/35',
          single && 'border-violet-500/20 bg-violet-500/[0.055]',
        )}
      >
        <button
          type="button"
          aria-pressed={data.focused && data.selectedField === undefined}
          className="flex h-full w-full cursor-pointer items-center gap-3 px-3.5 text-left outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
          onClick={(event) => {
            event.stopPropagation();
            data.onEntitySelect?.(entity.id);
          }}
        >
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-md border border-border/80 bg-background/80 text-muted-foreground shadow-xs',
              single &&
                'border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400',
            )}
          >
            {single ? (
              <Box className="size-3.5" aria-hidden />
            ) : (
              <Database className="size-3.5" aria-hidden />
            )}
          </span>
          <TruncatedText className="flex-1 text-sm font-semibold tracking-tight">
            {entity.label}
          </TruncatedText>
          <span
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em]',
              single
                ? 'border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                : 'border-border/70 bg-background/70 text-muted-foreground',
            )}
          >
            {entity.kind}
          </span>
          <span className="rounded-md border border-border/70 bg-background/70 px-1.5 py-0.5 font-mono text-[9px] font-medium text-muted-foreground">
            {entity.version}
          </span>
        </button>
      </header>

      <div className="divide-y divide-border/55">
        {entity.fields.length === 0 ? (
          <div className="grid h-[34px] place-items-center text-[11px] text-muted-foreground">
            No fields
          </div>
        ) : (
          entity.fields.map((field) => {
            const isId = entity.idField === field.name;
            const selected = data.selectedField === field.name;
            const connected = data.connectedFields.includes(field.name);
            return (
              <div key={field.name} className="relative h-[34px]">
                {isId && (
                  <>
                    <Handle
                      id={`id:${field.name}`}
                      type="target"
                      position={Position.Left}
                      className="!pointer-events-none !size-2.5 !-translate-x-px !border-2 !border-background !bg-primary"
                    />
                    {data.selfReferenced && (
                      <Handle
                        id={`self:id:${field.name}`}
                        type="target"
                        position={Position.Right}
                        className="!pointer-events-none !size-2.5 !translate-x-px !border-2 !border-background !bg-primary"
                      />
                    )}
                  </>
                )}
                {field.referenceTarget !== undefined && (
                  <Handle
                    id={`ref:${field.name}`}
                    type="source"
                    position={Position.Right}
                    className="!pointer-events-none !size-2.5 !translate-x-px !border-2 !border-background !bg-primary"
                  />
                )}

                <button
                  type="button"
                  aria-pressed={selected}
                  onMouseEnter={() =>
                    data.onFieldHover?.(entity.id, field.name, true)
                  }
                  onMouseLeave={() =>
                    data.onFieldHover?.(entity.id, field.name, false)
                  }
                  className={cn(
                    'nodrag nopan grid h-full w-full cursor-pointer grid-cols-[12px_minmax(0,1fr)_112px] items-center gap-2 px-3.5 text-left text-[11px] outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
                    field.referenceTarget !== undefined && 'bg-primary/[0.025]',
                    connected &&
                      'bg-primary/[0.075] shadow-[inset_2px_0_0_var(--primary)]',
                    selected &&
                      'bg-primary/12 shadow-[inset_3px_0_0_var(--primary)] ring-1 ring-inset ring-primary/25',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (field.complex !== undefined) {
                      data.onComplexFieldOpen?.(entity.id, field.name);
                    } else if (field.referenceTarget !== undefined) {
                      data.onFieldSelect?.(entity.id, field.name);
                    }
                  }}
                >
                  <span className="grid size-3 place-items-center">
                    {isId ? (
                      <KeyRound
                        className="size-3 text-amber-500 dark:text-amber-400"
                        aria-label="Identifier"
                      />
                    ) : field.complex !== undefined ? (
                      <Braces
                        className="size-3 text-primary/75"
                        aria-label="Inspect complex type"
                      />
                    ) : field.referenceTarget !== undefined ? (
                      <ArrowUpRight
                        className="size-3 text-primary/75"
                        aria-label={`References ${field.referenceTarget}`}
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <TruncatedText className="font-mono text-[10.5px] font-medium">
                      {field.name}
                    </TruncatedText>
                    {field.optional && (
                      <span className="text-[9px] text-muted-foreground">
                        optional
                      </span>
                    )}
                  </span>
                  <TruncatedText className="text-right font-mono text-[9.5px] text-muted-foreground">
                    {field.type}
                  </TruncatedText>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
