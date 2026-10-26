import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
} from '@kestack/web-platform/ui/components/collapsible';
import {
  CircleAlertIcon,
  PlusIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { ago } from '../../../../../ui/time/index.ts';
import { outOfReach } from '../../../../../layer/capabilities/index.ts';
import { useLock } from '../../../../machines/index.ts';
import { HarnessAccountsLive } from './actor.ts';
import { Card } from './card/index.ts';

/*
 * One Machine's agent accounts, under each agent's name with a + that adds
 * another login of it: a row per account (card/), its Default Account
 * first and the one being added last. Tapping a row opens its card under
 * it, and again closes it, sliding either way, on touch as with keys.
 * While the Machine's Line is not connected, the rows show as last kept
 * and take no tap, and none is added. Kept nowhere, a quiet skeleton of
 * the rows while the Machine answers, and, while it does not, a line that
 * says so.
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
    const accountOf = (key: string) =>
      accounts.find(({ id }) => id === key) ?? null;
    const harnessOf = (key: string) => accountOf(key)?.harness ?? model.adding;
    /** The Default Account first, the one being added last, the rest as listed. */
    const rank = (key: string) => {
      const index = accounts.findIndex(({ id }) => id === key);
      if (index === -1) return accounts.length + 1;
      return accounts[index]!.isDefault ? -1 : index;
    };
    const { health, locked, said } = useLock(model.machineId);
    const panelOf = (key: string) => `account-${model.machineId}-${key}-panel`;
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
      <div {...root} className="flex flex-col gap-5">
        {model.accounts !== null ? (
          <>
            {problem}
            {agents(model.accounts, model.adding).map((harness) => {
              const name = Card.agentName(harness);
              const cards = children.cards
                .filter((card) => harnessOf(card.key) === harness)
                .sort((a, b) => rank(a.key) - rank(b.key));
              return (
                <section
                  key={harness}
                  aria-labelledby={`agent-${model.machineId}-${harness}`}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      id={`agent-${model.machineId}-${harness}`}
                      className="text-sm font-semibold"
                    >
                      {name}
                    </h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Add ${name} account`}
                      disabled={locked}
                      className="-mr-2.5 size-11 text-muted-foreground keyboard:-mr-1.5 keyboard:size-8"
                      onClick={() => send({ _tag: 'AddAsked', harness })}
                    >
                      <PlusIcon aria-hidden />
                    </Button>
                  </div>
                  {cards.map((card) => {
                    const expanded = model.open === card.key;
                    return (
                      <div key={card.key} className="flex flex-col">
                        <Card.Row
                          account={accountOf(card.key)}
                          harness={harness}
                          expanded={expanded}
                          controls={panelOf(card.key)}
                          disabled={locked}
                          said={said}
                          onToggle={() =>
                            send({ _tag: 'Toggled', key: card.key })
                          }
                        />
                        <Collapsible open={expanded}>
                          <CollapsibleContent
                            id={panelOf(card.key)}
                            className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:h-0 data-ending-style:duration-150 data-starting-style:h-0 motion-reduce:transition-none"
                          >
                            <div className="pt-3 pb-6 keyboard:pb-5">
                              <Card.view instance={card} />
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </>
        ) : model.loadProblem !== null ? (
          problem
        ) : outOfReach(health) ? (
          <p role="status" className="text-sm text-muted-foreground">
            Not answering, last seen {ago(health.lastSeen)}. Its agents show
            here once it is back.
          </p>
        ) : (
          <div className="flex flex-col gap-4" aria-busy>
            {['claude', 'codex'].map((name) => (
              <div key={name} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);
