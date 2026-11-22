import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { CircleAlertIcon } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import { ProjectPickerLive } from './actor.js';
import { queryOf, shownOf, tilde, topOf } from './steps/index.js';
import { Footer, keyMessage, Option, Search, Trail } from './ui/index.js';

/*
 * The Project Picker as a panel, sized to whatever holds it: the Steps so
 * far, the search, the rows, and the keys at its foot. It draws no surface
 * of its own: the page centres it on one, or a Dialog holds it. Everything
 * it shows is the actor's; the View only says what was typed, pressed or
 * clicked, and keeps the row highlighted in view.
 */

export const ProjectPickerView = View.make(
  ProjectPickerLive,
  ({ root, model, props, send }) => {
    const current = props === undefined ? model.current : props.current;
    const shown = useMemo(() => shownOf(model, current), [model, current]);
    const top = topOf(model);
    const query = queryOf(model);
    const highlighted = top?.highlighted ?? model.highlighted;
    const active = shown.rows.some(({ value }) => value === highlighted)
      ? highlighted
      : (shown.rows[0]?.value ?? '');
    const activeRow = shown.rows.find(({ value }) => value === active);
    const removable =
      activeRow?._tag === 'Project' ? activeRow.project.id : null;
    const canBack = top !== null;

    const id = useId();
    const listId = `${id}-list`;
    const optionId = (at: number) => `${id}-option-${at}`;
    const activeAt = shown.rows.findIndex(({ value }) => value === active);

    // Kept in view as the keys move it; a row the mouse lit is in view already.
    const byMouse = useRef(false);
    useEffect(() => {
      if (byMouse.current) {
        byMouse.current = false;
        return;
      }
      if (activeAt === -1) return;
      const frame = requestAnimationFrame(() =>
        document
          .getElementById(optionId(activeAt))
          ?.scrollIntoView({ block: 'nearest' }),
      );
      return () => cancelAnimationFrame(frame);
    }, [activeAt, model.folders.length]);

    const onHover = useCallback(
      (value: string) => {
        byMouse.current = true;
        send({ _tag: 'Highlighted', value });
      },
      [send],
    );
    const onPick = useCallback(
      (value: string) => send({ _tag: 'Picked', value }),
      [send],
    );
    const onRemove = useCallback(
      (projectId: string) => send({ _tag: 'RemoveAsked', id: projectId }),
      [send],
    );

    let at = 0;
    return (
      <div
        {...root}
        className="flex w-full min-w-0 flex-col text-sm text-foreground"
      >
        <Trail
          crumbs={shown.where?.crumbs ?? []}
          kind={shown.where?.kind ?? null}
          canOpen={shown.where?.path != null && model.adding === null}
          onBack={() => send({ _tag: 'Back' })}
          onBackTo={(depth) => send({ _tag: 'BackTo', depth })}
          onOpen={() => send({ _tag: 'Chose', on: null })}
        />
        <Search
          // Each Step has its own field, so its caret starts at its end.
          key={model.folders.length}
          query={query}
          placeholder={shown.placeholder}
          loading={shown.loading && query.trim() !== ''}
          readOnly={model.adding !== null}
          listId={listId}
          activeId={activeAt === -1 ? undefined : optionId(activeAt)}
          onType={(next) => send({ _tag: 'Typed', query: next })}
          onKeyDown={(event) => {
            const message = keyMessage(event, {
              query,
              active,
              removable,
              canBack,
              inFolder: top !== null,
            });
            if (message === null) return;
            event.preventDefault();
            event.stopPropagation();
            send(message);
          }}
        />
        <div
          id={listId}
          role="listbox"
          aria-label={top === null ? 'Projects' : 'Folders'}
          aria-busy={shown.loading}
          className={cn(
            'max-h-[min(24rem,60dvh)] min-h-0 overflow-y-auto overscroll-contain p-1.5',
            scrollbarStyles,
          )}
        >
          {(shown.empty !== null ||
            shown.problem !== null ||
            (shown.loading && shown.rows.length === 0)) && (
            <State
              problem={shown.problem}
              loading={shown.loading}
              empty={shown.empty}
              hint={shown.hint}
              onRetry={
                top === null && model.recentProblem !== null
                  ? () => send({ _tag: 'Retried' })
                  : null
              }
            />
          )}
          {shown.groups.map((group, index) => (
            <Fragment key={group.heading ?? `group-${index}`}>
              {index > 0 && (
                <div
                  role="separator"
                  className="mx-2.5 my-1.5 h-px bg-border/60"
                />
              )}
              <div role="group" aria-label={group.heading ?? undefined}>
                {group.heading !== null && (
                  <div
                    aria-hidden
                    className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {group.heading}
                  </div>
                )}
                {group.rows.map(({ entry, matched }) => {
                  const index = at++;
                  return (
                    <Option
                      key={entry.value}
                      id={optionId(index)}
                      row={entry}
                      matched={matched}
                      active={entry.value === active}
                      onHover={onHover}
                      onPick={onPick}
                      onRemove={onRemove}
                    />
                  );
                })}
              </div>
            </Fragment>
          ))}
          {shown.truncated && (
            <p className="px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
              Showing the first 100 folders. Keep typing to narrow them down.
            </p>
          )}
        </div>
        {model.problem !== null && (
          <p
            role="alert"
            className="flex shrink-0 items-start gap-2 border-t border-border/60 px-3 py-2.5 text-xs text-destructive"
          >
            <CircleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0">{model.problem}</span>
          </p>
        )}
        <Footer
          inFolder={top !== null}
          query={query}
          project={removable !== null}
          canBack={canBack}
          adding={
            model.adding === null ? null : tilde(model.adding, model.home)
          }
        />
      </div>
    );
  },
);

/** What the list says instead of, or above, its rows: why, loading, or nothing matched. */
function State({
  problem,
  loading,
  empty,
  hint,
  onRetry,
}: {
  readonly problem: string | null;
  readonly loading: boolean;
  readonly empty: string | null;
  readonly hint: string | null;
  readonly onRetry: (() => void) | null;
}) {
  if (problem !== null)
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 px-6 py-8 text-center"
      >
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="text-pretty">{problem}</span>
        </p>
        {onRetry !== null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="active:scale-[0.96]"
          >
            Try again
          </Button>
        )}
      </div>
    );
  if (empty === null && loading)
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
      >
        <Spinner className="size-3.5" />
        Loading…
      </p>
    );
  if (empty === null) return null;
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-6 text-center">
      <p className="text-sm text-foreground/90">{empty}</p>
      {hint !== null && (
        <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
