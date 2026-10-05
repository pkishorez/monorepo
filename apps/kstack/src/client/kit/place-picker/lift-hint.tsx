import type { Item } from './item.ts';

/**
 * Where letting go will take you, in one line: "Let go | Entries", or,
 * past an end, that there is nothing further.
 */
export function LiftHint(props: {
  readonly item: Item;
  readonly past: boolean;
}) {
  if (props.past) {
    return (
      <span className="flex items-center py-1.5 pr-3.5 pl-3 text-muted-foreground">
        Nothing further
      </span>
    );
  }
  const Icon = props.item.icon;
  return (
    <span className="flex items-center gap-2 py-1.5 pr-3.5 pl-3">
      <span className="text-muted-foreground">Let go</span>
      <span className="h-3.5 w-px bg-border" />
      <Icon className="size-4" />
      <span className="font-medium">{props.item.label}</span>
    </span>
  );
}
