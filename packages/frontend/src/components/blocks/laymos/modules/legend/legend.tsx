import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDotDashed,
  Info,
} from '#lib/lucide';

const items = [
  {
    label: 'Root',
    description: 'No incoming dependencies',
    icon: ArrowUpFromLine,
  },
  {
    label: 'Terminal',
    description: 'No outgoing dependencies',
    icon: ArrowDownToLine,
  },
  {
    label: 'Isolated',
    description: 'No incoming or outgoing dependencies',
    icon: CircleDotDashed,
  },
  {
    label: 'Entry',
    description: 'Host-started and unavailable to other Modules',
    icon: Info,
  },
] as const;

export function ModuleLegend() {
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-muted-foreground"
      aria-label="Module legend"
    >
      {items.map(({ label, description, icon: Icon }) => (
        <span
          key={label}
          className="flex items-center gap-1"
          title={`${label}: ${description}`}
        >
          <Icon className="size-3" />
          {label}
        </span>
      ))}
      <span
        className="flex items-center gap-1"
        title="Shared: available to peers in its Layer"
      >
        <span className="size-2.5 rounded-sm border border-sky-500/60 bg-sky-500/15" />
        Shared
      </span>
    </div>
  );
}
