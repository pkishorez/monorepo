import type { HarnessAccountInfo } from '@kestack/connect/code';
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
 * One Machine's agent accounts, by agent: its name and a quiet button that
 * adds another login of it, then a row per account (card/), its Default
 * Account first and the one being added last. While the Machine's Line is
 * not connected, the rows show as last kept, each locked saying why, and
 * none is added. Nothing shows while what was kept is read; kept nowhere,
 * a quiet skeleton of the rows while the Machine answers, and, while it
 * does not, a line that says so.
 */

type Harness = HarnessAccountInfo['harness'];

/** Each agent with an account, or one being added, in the order the Machine lists them. */
const agents = (
  accounts: ReadonlyArray<HarnessAccountInfo>,
  adding: Harness | null,
): ReadonlyArray<Harness> => [
  ...new Set([
    ...accounts.map(({ harness }) => harness),
    ...(adding === null ? [] : [adding]),
  ]),
];

export const HarnessAccountsView = View.make(
  HarnessAccountsLive,
  ({ root, model, children, send }) => {
    const accounts = model.accounts ?? [];
    const harnessOf = (key: string) =>
      accounts.find(({ id }) => id === key)?.harness ?? model.adding;
    /** The Default Account first, the one being added last, the rest as listed. */
    const rank = (key: string) => {
      const index = accounts.findIndex(({ id }) => id === key);
      if (index === -1) return accounts.length + 1;
      return accounts[index]!.isDefault ? -1 : index;
    };
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
          <div className="flex flex-col gap-6">
            {problem}
            {agents(model.accounts, model.adding).map((harness) => {
              const name = Card.agentName(harness);
              const cards = children.cards
                .filter((card) => harnessOf(card.key) === harness)
                .sort((a, b) => rank(a.key) - rank(b.key));
              return (
                <section
                  key={harness}
                  aria-label={name}
                  className="flex flex-col gap-2"
                >
                  <div className="flex min-h-11 items-center gap-2 keyboard:min-h-8">
                    <h4 className="flex-1 text-sm font-semibold">{name}</h4>
                    {model.adding === null && !locked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Add a ${name} account`}
                        className="h-11 text-muted-foreground keyboard:h-8"
                        onClick={() => send({ _tag: 'AddAsked', harness })}
                      >
                        <PlusIcon aria-hidden />
                        Add account
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col divide-y divide-border *:py-3 *:first:pt-0 *:last:pb-0">
                    {cards.map((card) => (
                      <Card.view key={card.key} instance={card} />
                    ))}
                  </div>
                </section>
              );
            })}
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
