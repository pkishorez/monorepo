import { FolderIcon } from '#lib/lucide';

import { architectureTreeSelectedStyle } from './presentation';

interface ArchitectureTreeLegendProps {
  readonly title: string;
  readonly boundaryLabel: 'Layer' | 'Module';
}

export function ArchitectureTreeLegend({
  title,
  boundaryLabel,
}: ArchitectureTreeLegendProps) {
  const isLayer = boundaryLabel === 'Layer';
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FolderIcon className="size-3 text-muted-foreground/60" />
          Folder
        </span>
        {!isLayer && (
          <span className="flex items-center gap-1">
            <FolderIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
            <span className="text-emerald-600 dark:text-emerald-400">
              Layer
            </span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <FolderIcon
            className={
              isLayer
                ? 'size-3 text-emerald-600 dark:text-emerald-400'
                : 'size-3 text-sky-700 dark:text-sky-300'
            }
          />
          <span
            className={
              isLayer
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-sky-700 dark:text-sky-300'
            }
          >
            {boundaryLabel}
          </span>
        </span>
        <span
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium text-foreground"
          style={architectureTreeSelectedStyle(isLayer ? 'layer' : 'module')}
        >
          <FolderIcon className="size-3" />
          Selected
        </span>
      </div>
    </div>
  );
}
