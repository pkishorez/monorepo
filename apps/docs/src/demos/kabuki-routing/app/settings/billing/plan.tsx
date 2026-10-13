import { Card } from '../../../parts/index.ts';

/** The plan page: nothing to keep, so no Actor. */
export function Plan() {
  return (
    <Card>
      <p className="text-[13px]">Team plan, €120 a month.</p>
      <p className="text-xs text-muted-foreground">
        This page has no Actor: a function in Billing's outlet draws it.
      </p>
    </Card>
  );
}
