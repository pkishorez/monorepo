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
 * One Machine's agent accounts, one card each (card/), then the one being
 * added. Under the cards, a button per agent adds another login. Until
 * they are read, a quiet skeleton of the cards while the Machine answers,
 * and, while it does not, a line that says so.
 */

export const HarnessAccountsView = View.make(
  HarnessAccountsLive,
  ({ root, model, children, send }) => {
    const health = useHealth(model.machineId);
    return (
      <div {...root} className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Agents</h3>
          <p className="text-sm text-muted-foreground">
            The agents installed on this Machine, one card per login. Add
            another login, such as a work account, with its own config folder.
          </p>
        </header>
        {model.loadProblem !== null ? (
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
        ) : model.accounts === null ? (
          outOfReach(health) ? (
            <p role="status" className="text-sm text-muted-foreground">
              Not answering, last seen {ago(health.lastSeen)}. Its agents show
              here once it is back.
            </p>
          ) : (
            <div className="flex flex-col gap-4" aria-busy>
              {['claude', 'codex'].map((name) => (
                <div
                  key={name}
                  className="flex flex-col gap-4 rounded-xl border border-border p-5"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {children.cards.map((card) => (
              <Card.view key={card.key} instance={card} />
            ))}
            {model.adding === null && (
              <div className="flex flex-wrap gap-2">
                {[...new Set(model.accounts.map(({ harness }) => harness))].map(
                  (harness) => (
                    <Button
                      key={harness}
                      type="button"
                      variant="outline"
                      className="h-11 keyboard:h-9"
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
        )}
      </div>
    );
  },
);
