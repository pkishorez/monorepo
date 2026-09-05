import { Database, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TableSnapshot } from 'std-toolkit/snapshot';

import { cn } from '#lib/utils';

import { ComplexFieldDetails } from '../complex-field-details';
import { DiagramCanvas } from '../diagram-canvas';
import { layoutGraph } from '../graph-layout';
import { presentSnapshot } from '../relationship-presentation';

type Layout = Awaited<ReturnType<typeof layoutGraph>>;
type InspectedField = {
  readonly entityId: string;
  readonly fieldName: string;
};

export function ERDiagram({
  snapshot,
  className,
  ariaLabel,
}: {
  readonly snapshot: TableSnapshot;
  readonly className?: string;
  readonly ariaLabel?: string;
}) {
  const presentation = useMemo(() => presentSnapshot(snapshot), [snapshot]);
  const [layout, setLayout] = useState<Layout>();
  const [inspectedField, setInspectedField] = useState<InspectedField>();
  const openComplexField = useCallback(
    (entityId: string, fieldName: string) =>
      setInspectedField({ entityId, fieldName }),
    [],
  );
  const inspected = useMemo(() => {
    if (inspectedField === undefined) return undefined;
    const entity = presentation.entities.find(
      ({ id }) => id === inspectedField.entityId,
    );
    const field = entity?.fields.find(
      ({ name }) => name === inspectedField.fieldName,
    );
    return entity === undefined || field?.complex === undefined
      ? undefined
      : { entity, field };
  }, [inspectedField, presentation.entities]);

  useEffect(() => {
    let active = true;
    setLayout(undefined);
    void layoutGraph(presentation).then((next) => {
      if (active) setLayout(next);
    });
    return () => {
      active = false;
    };
  }, [presentation]);

  if (presentation.entities.length === 0) {
    return (
      <DiagramState
        className={className}
        icon={<Database className="size-5" aria-hidden />}
        title="No entities to display"
        detail={`${snapshot.logicalName} has no registered entities.`}
      />
    );
  }

  if (layout === undefined) {
    return (
      <DiagramState
        className={className}
        icon={<LoaderCircle className="size-5 animate-spin" aria-hidden />}
        title="Arranging entities"
        detail="Preparing a clean relationship layout."
      />
    );
  }

  return (
    <>
      <DiagramCanvas
        layout={layout}
        className={className}
        ariaLabel={ariaLabel ?? `${snapshot.logicalName} entity relationships`}
        onComplexFieldOpen={openComplexField}
      />
      <ComplexFieldDetails
        entityLabel={inspected?.entity.label ?? ''}
        field={inspected?.field}
        onOpenChange={(open) => {
          if (!open) setInspectedField(undefined);
        }}
      />
    </>
  );
}

function DiagramState({
  className,
  icon,
  title,
  detail,
}: {
  readonly className?: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div
      className={cn(
        'grid h-[560px] min-h-80 w-full place-items-center rounded-xl border border-dashed border-border bg-background',
        className,
      )}
    >
      <div className="flex max-w-xs flex-col items-center text-center">
        <div className="mb-3 grid size-10 place-items-center rounded-xl border border-border bg-muted/50 text-muted-foreground shadow-sm">
          {icon}
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
