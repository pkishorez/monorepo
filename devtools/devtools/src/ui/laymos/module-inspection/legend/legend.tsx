import { Lock, Network, Share2 } from 'kui-toolkit/lib/lucide';

// Exposed is the default on almost every Module, so only exceptions are marked.
const items = [
  {
    label: 'Shared',
    description: 'Peers in its own Layer may import it',
    icon: Share2,
    className: 'text-foreground',
  },
  {
    label: 'Private',
    description: 'Nothing may import it',
    icon: Lock,
    className: 'text-muted-foreground/60',
  },
  {
    label: 'Module Graph',
    description:
      'A bounded set of Modules whose Rules are the only way its members connect',
    icon: Network,
    className: 'text-muted-foreground',
  },
] as const;

export function ModuleLegend() {
  return (
    <div
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-muted-foreground"
      aria-label="Module legend"
    >
      <span className="text-muted-foreground">Unmarked: exposed</span>
      {items.map(({ label, description, icon: Icon, className }) => (
        <span
          key={label}
          className="flex items-center gap-1"
          title={`${label}: ${description}`}
        >
          <Icon className={`size-3 ${className}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
