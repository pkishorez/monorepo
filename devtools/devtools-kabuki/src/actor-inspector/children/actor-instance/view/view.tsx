import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { WorkerChip } from './chip.tsx';
import {
  actionsOf,
  hasFields,
  isPast,
  outcomeOf,
} from '../logic/shared/index.ts';
import { Dump, Section } from './dump.tsx';
import type { InstanceShape } from '../logic/shared/index.ts';
import { Form } from './form.tsx';

type BodyProps = ViewPropsOf<typeof InstanceShape>;

const whenOf = (at: BodyProps['props']['at']) =>
  at === null ? 'now' : at === 'start' ? 'at the start' : `at #${at}`;

export function Body(self: BodyProps) {
  const { model, props, send } = self;
  const { looked } = model;
  const past = isPast(self);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) send({ _tag: 'Closed' });
      }}
    >
      <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-base">
            {looked ? (looked.slot ?? looked.actor) : 'Instance'}
            {looked?.key !== undefined && (
              <span className="font-mono text-[13px] font-normal text-muted-foreground">
                {looked.key}
              </span>
            )}
            {looked && (
              <span className="text-[13px] font-normal text-changed">
                {looked.state}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {looked
              ? [looked.actor, looked.description, whenOf(props.at)]
                  .filter(Boolean)
                  .join(' · ')
              : (model.problem ?? 'Reading it…')}
          </DialogDescription>
        </DialogHeader>
        {looked && (
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="flex min-w-0 flex-col gap-5">
              {hasFields(looked.data) && (
                <Section title={`${looked.state} data`}>
                  <Dump value={looked.data} scope="state" />
                </Section>
              )}
              <Section title="Model">
                <Dump value={looked.model} scope="model" />
              </Section>
              {'props' in looked && (
                <Section title="Props from its parent">
                  <Dump value={looked.props} scope="props" />
                </Section>
              )}
              <Section title="Workers">
                {looked.workers.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    None running
                  </p>
                ) : (
                  <div className="-ml-2 flex flex-wrap gap-1">
                    {looked.workers.map((one) => (
                      <WorkerChip
                        key={`${one.name}:${one.key}`}
                        name={one.name}
                        {...(one.key === undefined
                          ? {}
                          : { workerKey: one.key })}
                        within={one.within}
                        {...(one.live ? { status: one.live.status } : {})}
                      />
                    ))}
                  </div>
                )}
              </Section>
              {looked.provides.length > 0 && (
                <Section title="Provides">
                  <p className="flex flex-wrap gap-x-3 text-[13px]">
                    {looked.provides.map((one) => (
                      <span key={one.name}>
                        {one.name}
                        {one.within === 'state' && (
                          <span className="text-muted-foreground">
                            {' '}
                            while {looked.state}
                          </span>
                        )}
                      </span>
                    ))}
                  </p>
                </Section>
              )}
              <Section title="States">
                <p className="flex flex-wrap gap-x-3 text-[13px]">
                  {looked.states.map((state) => (
                    <span
                      key={state}
                      className={cn(
                        state === looked.state
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {state}
                    </span>
                  ))}
                </p>
              </Section>
            </div>
            <Section title={past ? `Takes, in ${looked.state}` : 'Takes now'}>
              {past && (
                <div className="mb-1 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    You are looking at a past Step. Messages go to the app now.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => send({ _tag: 'NowAsked' })}
                    className="ml-auto h-7 shrink-0 text-xs"
                  >
                    Go to now
                  </Button>
                </div>
              )}
              {actionsOf(self).length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  It takes no Message in {looked.state}.
                </p>
              ) : (
                <div className="-mx-2.5 flex flex-col gap-0.5">
                  {actionsOf(self).map((action) => (
                    <Form
                      key={`${looked.address}:${action.tag}`}
                      action={action}
                      sending={model.sending === action.tag}
                      blocked={past}
                      outcome={outcomeOf(self, action.tag)}
                      onSend={(message) =>
                        send({ _tag: 'Submitted', tag: action.tag, message })
                      }
                      onEdit={() => send({ _tag: 'Edited', tag: action.tag })}
                    />
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
