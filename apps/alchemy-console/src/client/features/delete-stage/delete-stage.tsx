import { Effect, Stream } from 'effect';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'kui-toolkit/components/ui/button';
import { LockKeyhole, Trash2 } from 'kui-toolkit/lucide';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import { Rpc } from '../../connections/rpc/index.ts';
import {
  useRpcAction,
  useRpcQuery,
  rpcQueryKeys,
} from '../../session/rpc-session/index.ts';
import {
  canDeleteStage,
  DeleteStageError,
  type deletionEvent,
  type deletionPlan,
} from '../../../shared/contracts/delete-stage/index.ts';
import { PlanView } from './plan-view.tsx';

type Target = { stack: string; stage: string };
const Interaction = createContext<{
  admin: boolean;
  select: (target: Target) => void;
} | null>(null);

export function DeleteStage({
  storeId,
  children,
  onBusyChange,
  onDeleted,
}: {
  storeId: string;
  children: (Action: ComponentType<Target>) => ReactNode;
  onBusyChange: (busy: boolean) => void;
  onDeleted: (target: Target) => void;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const client = useQueryClient();
  const stores = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['AlchemyStateStore.List']({})),
    rpcQueryKeys.stores,
  );
  const admin =
    stores.data?.find((store) => store.id === storeId)?.access === 'admin';
  return (
    <Interaction value={{ admin, select: setTarget }}>
      {children(StageAction)}
      {target && (
        <DeletionDialog
          storeId={storeId}
          {...target}
          onClose={() => {
            setTarget(null);
            void client.invalidateQueries({
              queryKey: rpcQueryKeys.stacks(storeId),
            });
          }}
          onBusyChange={onBusyChange}
          onDeleted={() => onDeleted(target)}
        />
      )}
    </Interaction>
  );
}

function StageAction({ stack, stage }: Target) {
  const interaction = useContext(Interaction);
  if (!canDeleteStage(stage))
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        title="Stages whose names start with prod are protected."
        aria-label="Production stage is protected"
      >
        <LockKeyhole className="size-4" />
      </span>
    );
  return (
    <span
      title={
        interaction?.admin
          ? `Delete ${stage}`
          : 'Update this store’s token and choose Admin to delete stages.'
      }
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground hover:text-destructive"
        disabled={!interaction?.admin}
        aria-label={`Delete stage ${stage}`}
        onClick={() => interaction?.select({ stack, stage })}
      >
        <Trash2 />
      </Button>
    </span>
  );
}

function DeletionDialog({
  storeId,
  stack,
  stage,
  onClose,
  onBusyChange,
  onDeleted,
}: {
  storeId: string;
  stack: string;
  stage: string;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onDeleted: () => void;
}) {
  const [review, setReview] = useState(false);
  const [plan, setPlan] = useState<typeof deletionPlan.Type | null>(null);
  const [events, setEvents] = useState<
    Record<string, typeof deletionEvent.Type>
  >({});
  const [terminal, setTerminal] = useState<typeof deletionEvent.Type | null>(
    null,
  );
  const [activity, setActivity] = useState('');
  const attempted = useRef(false);
  const client = useQueryClient();
  const preview = useRpcAction(
    () =>
      Effect.flatMap(Rpc, (rpc) =>
        rpc['AlchemyStateStore.PreviewStageDeletion']({
          storeId,
          stack,
          stage,
        }),
      ),
    setPlan,
  );
  const deletion = useRpcAction(
    () =>
      Effect.gen(function* () {
        if (!plan) return;
        const rpc = yield* Rpc;
        let finished = false;
        yield* rpc['AlchemyStateStore.DeleteStage']({
          storeId,
          stack,
          stage,
          fingerprint: plan.fingerprint,
        }).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event.kind === 'heartbeat') return;
              if (event.kind === 'progress' && !event.id)
                setActivity(event.message);
              if (event.kind === 'progress' && event.id)
                setEvents((current) => ({ ...current, [event.id!]: event }));
              if (event.kind === 'complete' || event.kind === 'failed') {
                finished = true;
                setTerminal(event);
              }
            }),
          ),
        );
        if (!finished)
          return yield* Effect.fail(
            new DeleteStageError({
              code: 'remote-error',
              reason:
                'The connection ended without a final result. Refresh the stage and review a new plan before retrying.',
            }),
          );
      }),
    () => {},
  );
  const busy = deletion.pending;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (attempted.current && !busy)
      void client.invalidateQueries({ queryKey: rpcQueryKeys.stacks(storeId) });
  }, [busy, client, storeId]);
  const close = () => {
    if (busy) return;
    onClose();
    if (terminal?.kind === 'complete') onDeleted();
  };
  const failed = terminal?.kind === 'failed' || !!deletion.error;
  const finished = attempted.current && !busy;
  return (
    <Dialog
      open
      onOpenChange={(next, details) => {
        if (!next && busy) {
          details.cancel();
          return;
        }
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className={
          review
            ? 'flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl'
            : undefined
        }
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {busy
              ? 'Deleting stage…'
              : terminal?.kind === 'complete'
                ? 'Stage deleted'
                : failed
                  ? 'Deletion did not finish'
                  : review
                    ? 'Review stage deletion'
                    : 'Delete this stage?'}
          </DialogTitle>
          <DialogDescription>
            {review
              ? `${stack} / ${stage}`
              : `Would you really like to delete “${stage}” from “${stack}”? You’ll review the resources and deletion plan next.`}
          </DialogDescription>
        </DialogHeader>
        {review && (
          <div className="min-h-0 space-y-4 overflow-y-auto">
            {preview.pending && (
              <p
                role="status"
                className="py-8 text-center text-muted-foreground"
              >
                Preparing Alchemy’s deletion plan…
              </p>
            )}
            {preview.error && (
              <p role="alert" className="text-destructive">
                {preview.error}
              </p>
            )}
            {plan && <PlanView plan={plan} events={events} running={busy} />}
            {busy && activity && (
              <p role="status" className="text-sm text-muted-foreground">
                {activity}
              </p>
            )}
            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                Keep this page open until Alchemy finishes. This dialog will
                unlock when the operation ends.
              </p>
            )}
            {(terminal || deletion.error) && (
              <p
                role={failed ? 'alert' : 'status'}
                className={failed ? 'text-destructive' : 'text-sm'}
              >
                {deletion.error ?? terminal?.message}
              </p>
            )}
          </div>
        )}
        <DialogFooter className="shrink-0">
          {!busy && (
            <Button variant="outline" onClick={close}>
              {finished ? 'Close' : 'Cancel'}
            </Button>
          )}
          {!review && (
            <Button
              variant="destructive"
              onClick={() => {
                setReview(true);
                preview.run(undefined);
              }}
            >
              Yes, review deletion
            </Button>
          )}
          {review && !attempted.current && (
            <Button
              variant="destructive"
              disabled={!plan || preview.pending || busy}
              onClick={() => {
                attempted.current = true;
                onBusyChange(true);
                deletion.run(undefined);
              }}
            >
              Confirm delete
            </Button>
          )}
          {busy && (
            <Button variant="destructive" disabled>
              Deleting…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
