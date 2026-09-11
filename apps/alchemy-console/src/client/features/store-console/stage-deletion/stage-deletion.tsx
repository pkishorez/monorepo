import { Effect, Stream } from 'effect';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import { ScrollArea } from 'kui-toolkit/components/ui/scroll-area';
import { Trash2, TriangleAlert } from 'kui-toolkit/lucide';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcAction } from '../store-query/index.ts';
import {
  isProtectedStage,
  protectedStageAcknowledgement,
  DeleteStageError,
  type deletionEvent,
  type forgottenResource,
} from '../../../../shared/contracts/delete-stage/index.ts';
import { isAlchemyManagedStack } from '../../../../shared/contracts/state-address/index.ts';
import { PlanView } from './plan-view.tsx';
import {
  useDeletionPreview,
  DeletionPreview,
} from '../stage-deletion-preview/index.ts';

type Target = { stack: string; stage: string };
const Interaction = createContext<{
  select: (target: Target) => void;
} | null>(null);

export function DeleteStage({
  storeId,
  children,
  onBusyChange,
  onDeleted,
  onSettled,
}: {
  storeId: string;
  children: (Action: ComponentType<Target>) => ReactNode;
  onBusyChange: (busy: boolean) => void;
  onDeleted: (target: Target) => void;
  onSettled: () => void;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <Interaction value={{ select: setTarget }}>
      {children(StageAction)}
      {target && (
        <DeletionDialog
          storeId={storeId}
          {...target}
          onClose={() => {
            setTarget(null);
          }}
          onBusyChange={onBusyChange}
          onDeleted={() => onDeleted(target)}
          onSettled={onSettled}
        />
      )}
    </Interaction>
  );
}

/** Protected stages ask for an acknowledgement in the dialog. */
function StageAction({
  stack,
  stage,
  className,
}: Target & { className?: string }) {
  const interaction = useContext(Interaction);
  if (!interaction) return null;
  if (isAlchemyManagedStack(stack))
    return (
      <span
        className={`inline-flex ${className ?? ''}`}
        title="Alchemy manages this stack. Use Alchemy’s dedicated state-store teardown flow."
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-muted-foreground"
          aria-label={`Stage deletion unavailable for Alchemy-managed stage ${stage}`}
          disabled
        >
          <Trash2 />
        </Button>
      </span>
    );
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`size-11 text-muted-foreground hover:text-destructive ${className ?? ''}`}
      aria-label={`Delete stage ${stage}`}
      title={`Delete ${stage}`}
      onClick={() => interaction.select({ stack, stage })}
    >
      <Trash2 />
    </Button>
  );
}

function DeletionDialog({
  storeId,
  stack,
  stage,
  onClose,
  onBusyChange,
  onDeleted,
  onSettled,
}: {
  storeId: string;
  stack: string;
  stage: string;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onDeleted: () => void;
  onSettled: () => void;
}) {
  const [review, setReview] = useState(false);
  const protectedStage = isProtectedStage(stage);
  const [acknowledgement, setAcknowledgement] = useState('');
  const acknowledged =
    !protectedStage || acknowledgement === protectedStageAcknowledgement;
  const acknowledgementId = useId();
  const preview = useDeletionPreview({ storeId, stack, stage });
  const { plan } = preview;
  // Unsupported resources the user chose to ignore: Alchemy drops their state on confirm.
  const [forget, setForget] = useState<(typeof forgottenResource.Type)[]>([]);
  const ignored = (resource: typeof forgottenResource.Type) =>
    forget.some(
      (entry) => entry.id === resource.id && entry.type === resource.type,
    );
  const setIgnored = (
    resource: typeof forgottenResource.Type,
    ignore: boolean,
  ) =>
    setForget((current) => [
      ...current.filter(
        (entry) => entry.id !== resource.id || entry.type !== resource.type,
      ),
      ...(ignore ? [resource] : []),
    ]);
  // Every blocker is either resolved by the server or an unsupported row the user chose to ignore.
  const confirmable =
    !!plan &&
    (plan.executable ||
      plan.resources.every(
        (resource) =>
          resource.readiness === 'ready' ||
          (resource.readiness === 'unsupported' && ignored(resource)),
      ));
  const [events, setEvents] = useState<
    Record<string, typeof deletionEvent.Type>
  >({});
  const [terminal, setTerminal] = useState<typeof deletionEvent.Type | null>(
    null,
  );
  const [activity, setActivity] = useState('');
  const attempted = useRef(false);
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
          forget,
          acknowledgement: protectedStage ? acknowledgement : undefined,
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
    if (attempted.current && !busy) onSettled();
  }, [busy, onSettled]);
  const close = () => {
    if (busy) return;
    onClose();
    if (terminal?.kind === 'complete') onDeleted();
  };
  const failed = terminal?.kind === 'failed' || !!deletion.error;
  const finished = attempted.current && !busy;
  const planFailed = preview.failed;
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
                  : planFailed
                    ? 'Could not plan the deletion'
                    : review
                      ? 'Review stage deletion'
                      : 'Delete this stage?'}
          </DialogTitle>
          <DialogDescription>
            {review
              ? `${stack} / ${stage}`
              : `Delete “${stage}” from “${stack}”? You’ll review the plan before anything is removed.`}
            {!review && protectedStage && (
              <span className="mt-2 flex items-start gap-1.5 text-destructive">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                This looks like a production stage. You’ll have to type an
                acknowledgement before deleting it.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {review && (
          <ScrollArea className="min-h-0">
            <div className="space-y-4">
              {!plan && <DeletionPreview preview={preview} />}
              {plan && (
                <PlanView
                  plan={plan}
                  events={events}
                  running={busy}
                  ignored={ignored}
                  onIgnoreChange={attempted.current ? undefined : setIgnored}
                />
              )}
              {plan && protectedStage && !attempted.current && (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <label
                    htmlFor={acknowledgementId}
                    className="block text-sm font-medium"
                  >
                    Type{' '}
                    <span className="font-mono">
                      {protectedStageAcknowledgement}
                    </span>{' '}
                    to delete this production stage
                  </label>
                  <Input
                    id={acknowledgementId}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="characters"
                    value={acknowledgement}
                    onChange={(event) => setAcknowledgement(event.target.value)}
                    placeholder={protectedStageAcknowledgement}
                    aria-describedby={`${acknowledgementId}-hint`}
                  />
                  <p
                    id={`${acknowledgementId}-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    Exact match, all caps.
                  </p>
                </div>
              )}
              {busy && activity && (
                <p role="status" className="text-sm text-muted-foreground">
                  {activity}
                </p>
              )}
              {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                  Keep this page open. The dialog unlocks when Alchemy finishes.
                </p>
              )}
              {(terminal || deletion.error) && (
                <p
                  role={failed ? 'alert' : 'status'}
                  className={failed ? 'text-sm text-destructive' : 'text-sm'}
                >
                  {deletion.error ?? terminal?.message}
                </p>
              )}
            </div>
          </ScrollArea>
        )}
        <DialogFooter className="shrink-0">
          {!busy && (
            <Button variant="outline" onClick={close}>
              {finished || planFailed ? 'Close' : 'Cancel'}
            </Button>
          )}
          {!review && (
            <Button
              onClick={() => {
                setReview(true);
                preview.start();
              }}
            >
              Review deletion
            </Button>
          )}
          {review && planFailed && (
            <Button onClick={preview.start}>Retry</Button>
          )}
          {review && !planFailed && !attempted.current && (
            <Button
              variant="destructive"
              disabled={
                !confirmable || preview.pending || busy || !acknowledged
              }
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
