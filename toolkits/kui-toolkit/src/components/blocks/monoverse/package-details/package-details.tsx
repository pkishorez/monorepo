import type { MonorepoAnalysis, Package } from '../analysis';

import { BookOpen, Layers, Lock, TriangleAlert } from '#lib/lucide';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import {
  dependencyKindLabels,
  packageCycles,
  packageRelations,
  type PackageRelation,
} from '../monorepo-presentation';

interface PackageDetailsProps {
  readonly analysis: MonorepoAnalysis;
  readonly pkg: Package;
  readonly onSelect: (name: string | null) => void;
  readonly onOpenLaymos: (name: string) => void;
  readonly onOpenReadme: (name: string) => void;
  readonly className?: string;
}

export function PackageDetails({
  analysis,
  pkg,
  onSelect,
  onOpenLaymos,
  onOpenReadme,
  className,
}: PackageDetailsProps) {
  const relations = packageRelations(analysis, pkg.name);
  const cycles = packageCycles(analysis, pkg.name);

  return (
    <div className={cn('space-y-4 text-xs', className)}>
      <header className="space-y-2">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 break-all font-mono text-sm font-semibold">
            {pkg.name}
          </h3>
          <Button
            size="xs"
            variant="outline"
            aria-label="Open README"
            title="Open README"
            onClick={() => onOpenReadme(pkg.name)}
          >
            <BookOpen />
            README
          </Button>
          {pkg.hasLaymos && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onOpenLaymos(pkg.name)}
            >
              <Layers />
              Open in Laymos
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{pkg.group}</Badge>
          {pkg.version !== undefined && (
            <Badge variant="secondary" className="font-mono">
              {pkg.version}
            </Badge>
          )}
          {pkg.private && (
            <Badge variant="secondary">
              <Lock />
              private
            </Badge>
          )}
          {pkg.hasLaymos && (
            <Badge variant="outline" className="text-primary">
              <Layers />
              Laymos
            </Badge>
          )}
        </div>
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          {pkg.path}
        </p>
      </header>

      {cycles.length > 0 && (
        <section className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
          <h4 className="flex items-center gap-1.5 font-semibold text-destructive">
            <TriangleAlert className="size-3.5" />
            Package cycle violation
          </h4>
          {cycles.map(({ packages }) => (
            <p key={packages.join('>')} className="font-mono text-[11px]">
              {packages.map((name, index) => (
                <span key={name}>
                  {index > 0 && (
                    <span className="text-muted-foreground"> → </span>
                  )}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => onSelect(name)}
                  >
                    {name}
                  </button>
                </span>
              ))}
              <span className="text-muted-foreground"> → </span>
              <span>{packages[0]}</span>
            </p>
          ))}
        </section>
      )}

      <RelationList
        title="Dependencies"
        emptyLabel="Depends on no other Package"
        relations={relations.dependencies}
        onSelect={onSelect}
      />
      <RelationList
        title="Dependents"
        emptyLabel="No Package depends on it"
        relations={relations.dependents}
        onSelect={onSelect}
      />
    </div>
  );
}

function RelationList({
  title,
  emptyLabel,
  relations,
  onSelect,
}: {
  readonly title: string;
  readonly emptyLabel: string;
  readonly relations: readonly PackageRelation[];
  readonly onSelect: (name: string) => void;
}) {
  return (
    <section className="space-y-1">
      <h4 className="flex items-center gap-1.5 font-semibold text-muted-foreground">
        {title}
        <span className="tabular-nums">{relations.length}</span>
      </h4>
      {relations.length === 0 ? (
        <p className="text-muted-foreground/70">{emptyLabel}</p>
      ) : (
        <ul className="space-y-px">
          {relations.map(({ name, kinds }) => (
            <li key={name}>
              <button
                type="button"
                className="flex h-7 w-full min-w-0 items-center gap-2 rounded px-1 text-start outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => onSelect(name)}
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {name}
                </span>
                {kinds.map((kind) => (
                  <Badge
                    key={kind}
                    variant="secondary"
                    className="h-4 px-1.5 text-[10px]"
                  >
                    {dependencyKindLabels[kind]}
                  </Badge>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
