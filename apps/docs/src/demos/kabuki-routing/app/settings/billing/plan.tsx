import { Card } from '../../../parts/index.ts';

/** The plan, where the URL ends at billing: nothing to keep, so no Actor. */
export function Plan() {
  return (
    <Card>
      <p className="text-[13px]">Team plan, €120 a month.</p>
      <p className="text-xs text-muted-foreground">
        This has no Actor: Billing's View draws it with a function where the URL
        ends at billing.
      </p>
    </Card>
  );
}
