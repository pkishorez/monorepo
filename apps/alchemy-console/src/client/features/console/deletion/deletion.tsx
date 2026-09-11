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
import { Skeleton } from 'kui-toolkit/components/ui/skeleton';
import { Trash2 } from 'kui-toolkit/lucide';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcAction } from '../queries/index.ts';
import {
  isProtectedStage,
  protectedStageAcknowledgement,
  DeletionError,
  type credentialChoice,
  type deletionEvent,
  type deletionPlan,
  type forgottenResource,
} from '../../../../shared/contracts/deletion/index.ts';
import { isAlchemyManagedStack } from '../../../../shared/contracts/targets/index.ts';
import { providerLabels } from '../../../../shared/contracts/credentials/index.ts';
import { DeleteUsing } from './credentials.tsx';
import { ResourceList, forgets } from './resources.tsx';
import { useDeletionPreview } from './preview.tsx';

// The plan already says which credential each provider uses; resend exactly that.
const choicesOf = (
  plan: typeof deletionPlan.Type,
): (typeof credentialChoice.Type)[] =>
  plan.credentials.map((selection) => ({
    provider: selection.provider,
    credentialId: selection.selected,
    region: selection.region,
  }));

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

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const joinNames = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

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
  const protectedStage = isProtectedStage(stage);
  const [acknowledgement, setAcknowledgement] = useState('');
  const acknowledged =
    !protectedStage || acknowledgement === protectedStageAcknowledgement;
  const acknowledgementId = useId();
  const preview = useDeletionPreview({ storeId, stack, stage });
  const { plan } = preview;
  // Resources the user chose to skip: Alchemy drops their state on confirm
  // and leaves whatever they created behind.
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
  const blockers = plan
    ? plan.resources.filter((r) => r.readiness !== 'ready' && !ignored(r))
    : [];
  const confirmable = !!plan && !preview.stale && blockers.length === 0;
  const counts = plan
    ? {
        delete: plan.resources.filter(
          (r) => r.action === 'delete' && !forgets(r, ignored(r)),
        ).length,
        forget: plan.resources.filter((r) => forgets(r, ignored(r))).length,
      }
    : null;
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
        yield* rpc['Deletion.Delete']({
          storeId,
          stack,
          stage,
          fingerprint: plan.fingerprint,
          forget,
          credentials: choicesOf(plan),
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
            new DeletionError({
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
  const planFailed = preview.failure !== null && !preview.pending;
  const editable = !attempted.current;

  const providers = plan
    ? joinNames(plan.credentials.map((c) => providerLabels[c.provider]))
    : '';
  const title = busy
    ? `Deleting ${stage}…`
    : terminal?.kind === 'complete'
      ? `Deleted ${stage}`
      : failed
        ? 'Deletion did not finish'
        : `Delete ${stage}`;

  // One reserved line under the list: blockers, progress, or the final result.
  const helper: { tone: 'alert' | 'status'; text: string } | null =
    deletion.error || terminal
      ? {
          tone: failed ? 'alert' : 'status',
          text: deletion.error ?? terminal!.message,
        }
      : busy
        ? {
            tone: 'status',
            text: activity || 'Keep this page open until Alchemy finishes.',
          }
        : preview.failure
          ? {
              tone: 'alert',
              text: preview.failure.id
                ? `Planning stopped at ${preview.failure.id}. ${preview.failure.message} Nothing was deleted.`
                : `${preview.failure.message} Nothing was deleted.`,
            }
          : blockers.length
            ? {
                tone: 'alert',
                text: blockers.every(
                  (r) => r.readiness === 'missing-credentials',
                )
                  ? `${plural(blockers.length, 'resource')} still ${blockers.length === 1 ? 'needs' : 'need'} a credential.`
                  : `${plural(blockers.length, 'resource')} cannot be deleted. Skip and forget ${blockers.length === 1 ? 'it' : 'them'} to continue.`,
              }
            : counts?.forget
              ? {
                  tone: 'status',
                  text: `${plural(counts.forget, 'resource')} will be forgotten and left in place.`,
                }
              : null;

  const confirmLabel = !counts
    ? 'Delete stage'
    : counts.delete && counts.forget
      ? `Delete ${counts.delete}, forget ${counts.forget}`
      : counts.delete
        ? `Delete ${plural(counts.delete, 'resource')}`
        : counts.forget
          ? `Forget ${plural(counts.forget, 'resource')}`
          : 'Delete stage';

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
        className="flex h-[min(80dvh,44rem)] flex-col overflow-hidden sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate">{title}</DialogTitle>
          <DialogDescription className="flex min-h-5 flex-wrap items-center gap-x-1.5">
            <span className="truncate">{stack}</span>
            <span aria-hidden="true">·</span>
            {plan ? (
              <span className="tabular-nums">
                {plan.resources.length
                  ? `${plural(plan.resources.length, 'resource')}${providers ? ` across ${providers}` : ''}`
                  : 'No tracked resources'}
              </span>
            ) : (
              <Skeleton
                aria-label="Counting resources"
                className="h-3.5 w-40 motion-reduce:animate-none"
              />
            )}
            {protectedStage && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-destructive">Production stage</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div
            className="grid gap-6 pr-3"
            aria-busy={preview.pending || undefined}
          >
            <DeleteUsing
              plan={plan}
              onChange={
                plan && editable
                  ? (provider, change) =>
                      preview.start(
                        choicesOf(plan).map((choice) =>
                          choice.provider === provider
                            ? { ...choice, ...change }
                            : choice,
                        ),
                      )
                  : undefined
              }
            />
            <div
              className={
                preview.stale && plan
                  ? 'opacity-60 transition-opacity duration-150'
                  : 'transition-opacity duration-150'
              }
            >
              <ResourceList
                analysis={preview.analysis}
                plan={plan}
                events={events}
                running={busy}
                ignored={ignored}
                onIgnoreChange={editable ? setIgnored : undefined}
              />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="shrink-0 gap-3 sm:flex-col sm:items-stretch">
          <p
            role={helper?.tone === 'alert' ? 'alert' : 'status'}
            className={`min-h-5 text-sm ${helper?.tone === 'alert' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {helper?.text}
          </p>
          {protectedStage && editable && (
            <div className="grid gap-1.5">
              <label htmlFor={acknowledgementId} className="text-sm">
                Type{' '}
                <span className="font-mono text-xs">
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
              />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!busy && (
              <Button variant="outline" className="min-w-20" onClick={close}>
                {finished || planFailed ? 'Close' : 'Cancel'}
              </Button>
            )}
            {planFailed && !attempted.current && (
              <Button className="min-w-40" onClick={() => preview.start()}>
                Retry
              </Button>
            )}
            {!planFailed && !attempted.current && (
              <Button
                variant="destructive"
                className="min-w-40"
                disabled={!confirmable || preview.pending || !acknowledged}
                onClick={() => {
                  attempted.current = true;
                  onBusyChange(true);
                  deletion.run(undefined);
                }}
              >
                {confirmLabel}
              </Button>
            )}
            {busy && (
              <Button variant="destructive" className="min-w-40" disabled>
                Deleting…
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
