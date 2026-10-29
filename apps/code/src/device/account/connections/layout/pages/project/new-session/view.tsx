import { useState, type ComponentProps, type ReactNode } from 'react';
import { useChild } from '@kestack/kabuki/react';
import {
  GUTTERED,
  useGutter,
} from '../../../../../../../ui/page/gutter/index.ts';
import { Path, tilde } from '../../../../../../../ui/labels/path/index.ts';
import { keys } from '../../../commands.ts';
import { Draft } from '../draft/index.ts';

/*
 * A new session on the project's page, while no session is open: where it
 * will work, over the Draft at its foot, which starts it. The project's
 * name heads it, its folder under it, then the place where the Draft
 * draws its branch and New Worktree switch; once sent, its Starting in
 * that same place, the heading staying, until the Session's page is drawn
 * instead. The place keeps their room while the branches are read, so
 * nothing moves as they come. The page is the content's default Focus
 * Spot. The project page adds why no session can start, which blocks the
 * Draft, in place of the branch.
 */

type Instance = ComponentProps<typeof Draft.view>['instance'];

/** No Instance: what a Hook reads while the Draft is absent. */
const NONE = { id: '' } as Instance;

/** A new session: where it will work, over its Draft. */
export function NewSession({
  name,
  path,
  about,
  blocked,
  draft,
}: {
  /** The project's name and folder, once known. */
  readonly name: string | null;
  readonly path: string | null;
  /** In place of the branch, such as why no session can start; nothing given (or `false`), the branch. */
  readonly about?: ReactNode;
  /** Nothing can be sent, as `about` says. */
  readonly blocked: boolean;
  /** The project's new session Draft, while there is one. */
  readonly draft: Instance | undefined;
}) {
  const starting = useChild(draft ?? NONE, ({ model }) => model.starting);
  const page = keys.useFocusSpot('content', 'page', { default: true });
  // Where the Draft draws the branch.
  const [where, setWhere] = useState<HTMLElement | null>(null);
  // The Draft sits under the words, inset by the room their scrollbar keeps.
  const gutter = useGutter();
  const shown = draft && starting;
  return (
    <>
      <div
        ref={page}
        tabIndex={-1}
        className={`relative flex min-h-0 flex-1 flex-col justify-end overflow-y-auto outline-none ${GUTTERED}`}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-8 pb-6 sm:px-6">
          <header className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {name ?? 'New session'}
            </h2>
            {path !== null && (
              <p className="flex min-w-0 text-xs text-muted-foreground">
                <Path value={tilde(path)} />
              </p>
            )}
          </header>
          {about || (
            // One place: the branch, then Starting over it, the room of the
            // branch kept, so neither the heading nor the Draft moves.
            <div className="grid *:[grid-area:1/1]">
              <Reserve />
              <div
                ref={setWhere}
                inert={!!shown}
                data-starting={shown ? '' : undefined}
                className="transition-opacity duration-150 ease-in data-starting:opacity-0 motion-reduce:transition-none"
              />
              {shown && (
                <div className="animate-in duration-200 ease-out fade-in-0 motion-reduce:animate-none">
                  <Draft.Starting starting={shown} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <section
        aria-label="New session"
        style={{ paddingInline: gutter }}
        className="relative shrink-0 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent has-[[data-slot=draft][data-touch]]:pb-0"
      >
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 has-[[data-slot=draft][data-touch]]:px-0">
          {draft && (
            <Draft.Slots value={{ blocked, where: blocked ? null : where }}>
              <Draft.view instance={draft} />
            </Draft.Slots>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * The room of the branch's two rows, drawn unseen, so the place is as tall
 * at every Text Size before the branches are read as after. The New
 * Worktree row keeps two lines for what it says, which wraps on a phone
 * once switched on, so switching it moves nothing either.
 */
function Reserve() {
  return (
    <div aria-hidden className="invisible -mx-3 flex flex-col gap-0.5">
      {[1, 2].map((lines) => (
        <div key={lines} className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-sm font-medium">·</span>
          <span className="text-sm">
            ·{lines === 2 && <br />}
            {lines === 2 && '·'}
          </span>
        </div>
      ))}
    </div>
  );
}
