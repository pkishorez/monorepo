import type { Package } from '../analysis';

import { FolderIcon, Layers, PackageIcon, TriangleAlert } from '#lib/lucide';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import { ChangeBadge } from '../../git-changes';

import {
  groupPackages,
  packageEmphasis,
  type PackageDecoration,
  type PackageFocus,
} from '../monorepo-presentation';

interface PackageTreeProps {
  readonly packages: readonly Package[];
  readonly decorations: ReadonlyMap<string, PackageDecoration>;
  readonly focus: PackageFocus;
  readonly selectedPackage: string | null;
  readonly onSelect: (name: string | null) => void;
  readonly onHoverChange: (name: string | null) => void;
  readonly onOpenLaymos: (name: string) => void;
  readonly className?: string;
}

// The side list of a Monorepo's Packages under their Package groups. Selecting
// here and selecting on the canvas are one selection.
export function PackageTree({
  packages,
  decorations,
  focus,
  selectedPackage,
  onSelect,
  onHoverChange,
  onOpenLaymos,
  className,
}: PackageTreeProps) {
  const groups = groupPackages(packages);

  if (groups.length === 0) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        No Packages
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)} aria-label="Package tree">
      {groups.map(({ group, packages: members }) => (
        <section key={group}>
          <div className="flex h-7 items-center gap-1.5 font-mono text-xs text-muted-foreground/70">
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{group}</span>
            <span className="ms-auto tabular-nums">{members.length}</span>
          </div>
          <ul className="relative ms-1.5 space-y-px border-s border-border/70 ps-2">
            {members.map((pkg) => {
              const decoration = decorations.get(pkg.name);
              const selected = selectedPackage === pkg.name;
              const emphasis = packageEmphasis(focus, pkg.name);
              return (
                <li key={pkg.name} className="group/row flex items-center">
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded pe-1.5 ps-1 font-mono text-xs font-medium text-foreground/90 outline-none transition-opacity hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40',
                      selected && 'bg-accent font-bold text-accent-foreground',
                      emphasis === 'softened' && 'opacity-70',
                      emphasis === 'dimmed' && 'opacity-40',
                      decoration?.inCycle && 'text-destructive',
                    )}
                    aria-pressed={selected}
                    onPointerEnter={() => onHoverChange(pkg.name)}
                    onPointerLeave={() => onHoverChange(null)}
                    onClick={() => {
                      onHoverChange(null);
                      onSelect(selected ? null : pkg.name);
                    }}
                  >
                    <PackageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-start">
                      {pkg.name}
                    </span>
                    {decoration?.changeStatus !== undefined && (
                      <ChangeBadge status={decoration.changeStatus} />
                    )}
                    {decoration?.inCycle && (
                      <TriangleAlert
                        className="size-3.5 shrink-0 text-destructive"
                        aria-label="Package cycle violation"
                      />
                    )}
                    {pkg.hasLaymos && (
                      <Layers
                        className="size-3.5 shrink-0 text-primary"
                        aria-label="Laymos badge"
                      />
                    )}
                  </button>
                  {pkg.hasLaymos && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                      aria-label={`Open ${pkg.name} in Laymos`}
                      title="Open in Laymos"
                      onClick={() => onOpenLaymos(pkg.name)}
                    >
                      <Layers />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
