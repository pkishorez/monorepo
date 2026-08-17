import { FolderIcon } from '#lib/lucide';

interface ArchitectureTreeLegendProps {
  readonly title: string;
  readonly boundaryLabel: 'Layer' | 'Module';
}

// Structure reads by weight, so the legend teaches weight rather than colour.
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
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <FolderIcon className="size-3 text-foreground" />
            Layer
          </span>
        )}
        <span
          className={
            isLayer
              ? 'flex items-center gap-1 font-semibold text-foreground'
              : 'flex items-center gap-1 text-foreground/90'
          }
        >
          <FolderIcon
            className={
              isLayer
                ? 'size-3 text-foreground'
                : 'size-3 text-muted-foreground'
            }
          />
          {boundaryLabel}
        </span>
      </div>
    </div>
  );
}
