import {
  ArrowUpRight,
  Brackets,
  Braces,
  CircleDot,
  GitBranch,
} from 'lucide-react';

import { cn } from '#lib/utils';

import type {
  PresentedComplexType,
  PresentedNestedField,
} from '../relationship-presentation';

function FieldRow({
  field,
  last,
}: {
  readonly field: PresentedNestedField;
  readonly last: boolean;
}) {
  return (
    <div className="relative ps-7">
      <span
        className={cn(
          'absolute left-2.5 top-0 w-px bg-border/80',
          last ? 'h-5' : 'h-full',
        )}
        aria-hidden
      />
      <span
        className="absolute left-2.5 top-5 h-px w-3.5 bg-border/80"
        aria-hidden
      />
      <div className="rounded-md border border-border/60 bg-background">
        <div
          className={cn(
            'flex min-h-9 items-center gap-2 px-2.5',
            field.referenceTarget !== undefined && 'bg-primary/[0.025]',
          )}
        >
          <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
            {field.referenceTarget !== undefined ? (
              <ArrowUpRight className="size-3.5 text-primary" aria-hidden />
            ) : field.complex !== undefined ? (
              <Braces className="size-3 text-primary/75" aria-hidden />
            ) : (
              <CircleDot className="size-2.5" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
            {field.name}
          </span>
          {field.optional && (
            <span className="shrink-0 text-[9px] text-muted-foreground">
              optional
            </span>
          )}
          <span className="max-w-32 shrink-0 truncate font-mono text-[9px] text-muted-foreground">
            {field.type}
          </span>
          {field.referenceTarget !== undefined && (
            <span className="max-w-28 shrink-0 truncate rounded border border-primary/20 bg-primary/[0.06] px-1.5 py-0.5 text-[8.5px] font-medium text-primary">
              → {field.referenceTarget}
            </span>
          )}
        </div>
        {field.complex !== undefined && (
          <div className="border-t border-border/50 bg-muted/[0.1] p-2">
            <ComplexTypeTree complex={field.complex} />
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectTree({
  fields,
}: {
  readonly fields: readonly PresentedNestedField[];
}) {
  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
        Empty object
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {fields.map((field, index) => (
        <FieldRow
          key={`${field.name}:${index}`}
          field={field}
          last={index === fields.length - 1}
        />
      ))}
    </div>
  );
}

function TypeSection({
  icon,
  label,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-muted/[0.1]">
      <div className="flex h-8 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 text-[9px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

export function ComplexTypeTree({
  complex,
}: {
  readonly complex: PresentedComplexType;
}) {
  if (complex.kind === 'array') {
    return (
      <TypeSection
        icon={<Brackets className="size-3.5 text-primary" aria-hidden />}
        label="Array items"
      >
        <ComplexTypeTree complex={complex.element} />
      </TypeSection>
    );
  }

  if (complex.kind === 'tuple') {
    return (
      <TypeSection
        icon={<Brackets className="size-3.5 text-primary" aria-hidden />}
        label={`${complex.elements.length} tuple items`}
      >
        <div className="grid gap-2">
          {complex.elements.map((element, index) => (
            <div
              key={index}
              className="rounded-md border border-border/65 bg-background p-2.5"
            >
              <div className="mb-2 font-mono text-[9px] text-muted-foreground">
                Item {index + 1}
              </div>
              <ComplexTypeTree complex={element} />
            </div>
          ))}
          {complex.rest.map((element, index) => (
            <div
              key={`rest:${index}`}
              className="rounded-md border border-border/65 bg-background p-2.5"
            >
              <div className="mb-2 font-mono text-[9px] text-muted-foreground">
                {index === 0 ? 'Remaining items' : `Trailing item ${index}`}
              </div>
              <ComplexTypeTree complex={element} />
            </div>
          ))}
        </div>
      </TypeSection>
    );
  }

  if (complex.kind === 'union') {
    return (
      <TypeSection
        icon={<GitBranch className="size-3.5 text-primary" aria-hidden />}
        label={`${complex.variants.length} variants`}
      >
        <div className="grid gap-2">
          {complex.variants.map((variant, index) => (
            <section
              key={`${variant.label}:${index}`}
              className={cn(
                'min-w-0 rounded-md border border-border/65 bg-background',
                variant.type.kind === 'type'
                  ? 'flex min-h-9 items-center px-2.5'
                  : 'p-2.5',
              )}
            >
              <div
                className={cn(
                  'flex min-w-0 items-center gap-2',
                  variant.type.kind !== 'type' && 'mb-2',
                )}
              >
                <span className="truncate rounded-md border border-primary/25 bg-primary/[0.08] px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {variant.label}
                </span>
                {variant.type.kind === 'type' &&
                  variant.type.referenceTarget !== undefined && (
                    <span className="ms-auto flex min-w-0 items-center gap-1 rounded border border-primary/20 bg-primary/[0.07] px-1.5 py-0.5 text-[8.5px] font-medium text-primary">
                      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        References {variant.type.referenceTarget}
                      </span>
                    </span>
                  )}
              </div>
              {variant.type.kind !== 'type' && (
                <ComplexTypeTree complex={variant.type} />
              )}
            </section>
          ))}
        </div>
      </TypeSection>
    );
  }

  if (complex.kind === 'type') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/65 bg-background px-3 py-2 font-mono text-[10px]">
        <CircleDot className="size-2.5 text-muted-foreground" aria-hidden />
        <span>{complex.type}</span>
        {complex.referenceTarget !== undefined && (
          <span className="ms-auto text-primary">
            → {complex.referenceTarget}
          </span>
        )}
      </div>
    );
  }

  return <ObjectTree fields={complex.fields} />;
}
