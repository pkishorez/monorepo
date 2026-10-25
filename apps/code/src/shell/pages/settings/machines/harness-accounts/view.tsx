import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  CircleAlertIcon,
  PlusIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { ago } from '../../../../../ui/time/index.ts';
import { outOfReach } from '../../../../../layer/capabilities/index.ts';
import { useHealth } from '../../../../machines/index.ts';
import { HarnessAccountsLive } from './actor.ts';
import { Card } from './card/index.ts';

/*
 * One Machine's agent accounts, a row each (card/), then the one being
 * added. Under the rows, a quiet button per agent adds another login.
 * While the Machine's Line is not connected, the rows show as last kept,
 * each locked saying why, and none is added. Nothing shows while what was
 * kept is read; kept nowhere, a quiet skeleton of the rows while the
 * Machine answers, and, while it does not, a line that says so.
 */

export const HarnessAccountsView = View.make(
  HarnessAccountsLive,
  ({ root, model, children, send }) => {
    const health = useHealth(model.machineId);
    const locked = health._tag !== 'Connected';
    const problem = model.loadProblem !== null && (
      <p
        role="alert"
        className="flex items-center gap-2 text-sm text-destructive"
      >
        <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
        {model.loadProblem}
        <Button
          variant="link"
          size="xs"
          type="button"
          onClick={() => send({ _tag: 'Retry' })}
        >
          Try again
        </Button>
      </p>
    );
    return (
      <div {...root} className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">Agents</h3>
        {model.accounts !== null ? (
          <div className="flex flex-col gap-5">
            {problem}
            {children.cards.map((card) => (
              <Card.view key={card.key} instance={card} />
            ))}
            {model.adding === null && !locked && (
              <div className="flex flex-wrap gap-2">
                {[...new Set(model.accounts.map(({ harness }) => harness))].map(
                  (harness) => (
                    <Button
                      key={harness}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 text-muted-foreground keyboard:h-8"
                      onClick={() => send({ _tag: 'AddAsked', harness })}
                    >
                      <PlusIcon aria-hidden />
                      Add a {Card.agentName(harness)} account
                    </Button>
                  ),
                )}
              </div>
            )}
          </div>
        ) : !model.savedRead ? null : model.loadProblem !== null ? (
          problem
        ) : outOfReach(health) ? (
          <p role="status" className="text-sm text-muted-foreground">
            Not answering, last seen {ago(health.lastSeen)}. Its agents show
            here once it is back.
          </p>
        ) : (
          <div className="flex flex-col gap-5" aria-busy>
            {['claude', 'codex'].map((name) => (
              <div key={name} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);
